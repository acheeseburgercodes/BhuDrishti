"""Ingestion pipeline: validation → idempotency → classify → quality → cross-confirm → alert.

Pure helpers are module-level functions so they can be unit-tested without FastAPI.
"""
from __future__ import annotations

import re
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Callable

try:
    from .contracts import TelemetryIn, parse_ts
except ImportError:  # pragma: no cover - supports `uvicorn main:app` from backend/
    from contracts import TelemetryIn, parse_ts

CROSS_CONFIRM_WINDOW_S = 30
CROSS_CONFIRM_BONUS = 0.15
_SANITIZE = re.compile(r"[^\w .,:;()/%+\-@#·–]", re.UNICODE)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def sanitize_text(value: Any, limit: int = 200) -> str:
    """Strip control/markup characters before text reaches logs, prompts or the UI."""
    return _SANITIZE.sub("", str(value))[:limit]


def sensor_quality(window: list[float], features: dict[str, float], sample_rate_hz: float) -> dict[str, Any]:
    """Heuristic signal-quality flags; they lower alert confidence, they never raise it."""
    flags: list[str] = []
    span = max(window) - min(window) if window else 0.0
    if span < 1e-6:
        flags.append("flatline")
    peak = max((abs(v) for v in window), default=0.0)
    if peak > 0 and sum(1 for v in window if abs(abs(v) - peak) < 1e-9) >= max(3, len(window) // 20):
        flags.append("clipping")
    if len(window) < 64:
        flags.append("short_window")
    if sample_rate_hz < 50:
        flags.append("low_sample_rate")
    if features.get("dominant_frequency_hz", 0) >= sample_rate_hz / 2 * 0.95:
        flags.append("aliasing_risk")
    penalty = {"flatline": 0.5, "clipping": 0.2, "short_window": 0.15, "low_sample_rate": 0.1, "aliasing_risk": 0.1}
    score = 1.0
    for flag in flags:
        score *= 1 - penalty[flag]
    return {"score": round(score, 3), "flags": flags}


def cross_confirmation(prior_events: list[dict[str, Any]], node_id: str, source: str, is_event: bool,
                       now: datetime, window_s: int = CROSS_CONFIRM_WINDOW_S) -> dict[str, Any]:
    """An event is cross-confirmed when *both* sources flagged `event` at the node within the window."""
    if not is_event:
        return {"cross_confirmed": False, "sources": [], "window_s": window_s, "matched_event_ids": []}
    matched: list[str] = []
    sources = {source}
    for prior in prior_events:
        if prior.get("node_id") != node_id or prior.get("classification", {}).get("classification") != "event":
            continue
        try:
            age = (now - parse_ts(prior["recorded_at"])).total_seconds()
        except (KeyError, ValueError):
            continue
        if 0 <= age <= window_s or -window_s <= age < 0:
            sources.add(prior.get("source"))
            if prior.get("source") != source:
                matched.append(prior.get("id"))
    return {
        "cross_confirmed": {"esp32_node", "phone_layer"} <= sources,
        "sources": sorted(s for s in sources if s),
        "window_s": window_s,
        "matched_event_ids": matched[:5],
    }


def alert_confidence(model_confidence: float, is_event: bool, cross_confirmed: bool, quality_score: float) -> float:
    """Combine model confidence, independent confirmation and signal quality (0..1)."""
    if not is_event:
        return 0.0
    base = model_confidence * quality_score
    if cross_confirmed:
        base = min(1.0, base + CROSS_CONFIRM_BONUS)
    return round(max(0.0, min(1.0, base)), 4)


def alert_level(is_event: bool, cross_confirmed: bool, confidence: float) -> str | None:
    """advisory = single source; watch = cross-confirmed. 'warning' is only ever set by a human."""
    if not is_event:
        return None
    if cross_confirmed and confidence >= 0.7:
        return "watch"
    return "advisory"


class IdempotencyCache:
    def __init__(self, capacity: int = 5000) -> None:
        self.capacity = capacity
        self._data: OrderedDict[str, dict[str, Any]] = OrderedDict()

    def get(self, key: str | None) -> dict[str, Any] | None:
        if not key:
            return None
        value = self._data.get(key)
        if value is not None:
            self._data.move_to_end(key)
        return value

    def put(self, key: str | None, value: dict[str, Any]) -> None:
        if not key:
            return
        self._data[key] = value
        self._data.move_to_end(key)
        while len(self._data) > self.capacity:
            self._data.popitem(last=False)


class IngestionService:
    """Owns the in-memory state used in demo mode and as a cache in Supabase mode."""

    def __init__(self, nodes: list[dict[str, Any]], classify: Callable[[list[float]], dict[str, Any]],
                 clock: Callable[[], datetime] = utc_now, max_events: int = 200) -> None:
        self.nodes = nodes
        self.classify = classify
        self.clock = clock
        self.max_events = max_events
        self.events: list[dict[str, Any]] = []
        self.alerts: list[dict[str, Any]] = []
        self.ingestion_log: list[dict[str, Any]] = []
        self.audit: list[dict[str, Any]] = []
        self.idempotency = IdempotencyCache()

    # ── lookups ──
    def find_node(self, node_id: str) -> dict[str, Any] | None:
        return next((n for n in self.nodes if n["id"] == node_id), None)

    def log(self, outcome: str, telemetry: TelemetryIn | None, client: str, detail: str = "", event_id: str | None = None) -> dict[str, Any]:
        entry = {
            "id": f"ing-{uuid.uuid4().hex[:12]}",
            "received_at": self.clock().isoformat(),
            "outcome": outcome,
            "node_id": telemetry.node_id if telemetry else None,
            "device_id": telemetry.device_id if telemetry else None,
            "source": telemetry.source if telemetry else None,
            "channel": telemetry.channel if telemetry else None,
            "client": sanitize_text(client, 64),
            "detail": sanitize_text(detail),
            "event_id": event_id,
            "queued": bool(telemetry and telemetry.queued),
        }
        self.ingestion_log.insert(0, entry)
        del self.ingestion_log[500:]
        return entry

    def record_audit(self, action: str, actor: str, target: str, detail: dict[str, Any] | None = None) -> dict[str, Any]:
        entry = {"id": f"aud-{uuid.uuid4().hex[:12]}", "at": self.clock().isoformat(), "action": action,
                 "actor": sanitize_text(actor, 64), "target": sanitize_text(target, 64), "detail": detail or {}}
        self.audit.insert(0, entry)
        del self.audit[500:]
        return entry

    # ── pipeline ──
    def _resolve_node(self, t: TelemetryIn) -> dict[str, Any]:
        node = self.find_node(t.node_id)
        if node is not None:
            return node
        if t.source != "phone_layer":
            raise LookupError(f"Unknown node: {t.node_id}")
        anchor = self.nodes[0] if self.nodes else {"lat": 28.05, "lng": 85.25}
        node = {
            "id": t.node_id,
            "name": f"Phone · {t.node_id}",
            "lat": t.lat if t.lat is not None else anchor.get("lat"),
            "lng": t.lng if t.lng is not None else anchor.get("lng"),
            "location_estimated": t.lat is None,
            "status": "online",
            "battery_pct": t.battery_pct,
            "source": "phone_layer",
            "kind": "phone",
            "registered_at": self.clock().isoformat(),
        }
        self.nodes.append(node)
        return node

    def process(self, t: TelemetryIn, client: str = "unknown") -> tuple[dict[str, Any], bool]:
        """Return (event, duplicate). Raises LookupError for unknown non-phone nodes."""
        cached = self.idempotency.get(t.client_event_id)
        if cached is not None:
            self.log("duplicate", t, client, "client_event_id already ingested", cached["id"])
            return cached, True
        node = self._resolve_node(t)
        now = self.clock()
        model = self.classify(t.sensor_window)
        is_event = model["classification"] == "event"
        quality = sensor_quality(t.sensor_window, model["features"], t.sample_rate_hz)
        recorded_at = t.recorded_at or t.captured_at or now.isoformat()
        confirm = cross_confirmation(self.events, t.node_id, t.source, is_event, parse_ts(recorded_at))
        confidence = alert_confidence(model["confidence"], is_event, confirm["cross_confirmed"], quality["score"])
        if confirm["cross_confirmed"]:
            # Preserve the original contract: classification.confidence carries the bonus.
            model = {**model, "confidence": round(min(1.0, model["confidence"] + CROSS_CONFIRM_BONUS), 4)}
        event_id = f"evt-{uuid.uuid4().hex[:16]}"
        event = {
            "id": event_id,
            "node_id": t.node_id,
            "node_name": node.get("name", t.node_id),
            "device_id": t.device_id,
            "lat": t.lat if t.lat is not None else node.get("lat"),
            "lng": t.lng if t.lng is not None else node.get("lng"),
            "recorded_at": recorded_at,
            "received_at": now.isoformat(),
            "source": t.source,
            "channel": t.channel,
            "transport": t.transport,
            "queued": t.queued,
            "queued_at": t.queued_at,
            "attempt": t.attempt,
            "client_event_id": t.client_event_id,
            "demo": t.demo or t.channel == "simulator",
            "synthetic_window": t.synthetic_window,
            "telemetry": t.model_dump(),
            "classification": model,
            "quality": quality,
            "cross_confirmation": confirm,
            "alert_confidence": confidence,
            "confirmation": "cross-confirmed" if confirm["cross_confirmed"] else "unconfirmed, single-source",
        }
        # Late (queued) readings must not move node freshness/status backwards in time.
        previous = node.get("last_seen")
        try:
            is_latest = previous is None or parse_ts(previous) <= parse_ts(recorded_at)
        except ValueError:
            is_latest = True
        if is_latest:
            node["last_seen"] = recorded_at
            node["battery_pct"] = t.battery_pct
            node["status"] = "critical" if is_event else "online"
        node.setdefault("source", t.source)
        if t.device_id:
            node["device_id"] = t.device_id
        self.events.insert(0, event)
        del self.events[self.max_events:]
        self.idempotency.put(t.client_event_id, event)
        level = alert_level(is_event, confirm["cross_confirmed"], confidence)
        if level:
            event["alert_id"] = self._raise_alert(event, level)["id"]
        self.log("accepted", t, client, "queued replay" if t.queued else "", event_id)
        return event, False

    def _raise_alert(self, event: dict[str, Any], level: str) -> dict[str, Any]:
        # Merge into an open alert for the same node within 10 minutes instead of spamming.
        now = self.clock()
        for alert in self.alerts:
            if alert["node_id"] == event["node_id"] and alert["status"] in ("open", "pending_approval") \
                    and (now - parse_ts(alert["updated_at"])).total_seconds() <= 600:
                alert["event_ids"] = [event["id"], *alert["event_ids"]][:20]
                alert["updated_at"] = now.isoformat()
                if level == "watch" and alert["level"] == "advisory":
                    alert["level"] = "watch"
                alert["confidence"] = max(alert["confidence"], event["alert_confidence"])
                alert["sources"] = sorted(set(alert["sources"]) | {event["source"]})
                return alert
        alert = {
            "id": f"alr-{uuid.uuid4().hex[:12]}",
            "node_id": event["node_id"],
            "node_name": event["node_name"],
            "lat": event["lat"],
            "lng": event["lng"],
            "level": level,
            # Public notification of any alert needs a human; the system only drafts.
            "status": "pending_approval",
            "requires_approval": True,
            "confidence": event["alert_confidence"],
            "sources": [event["source"]],
            "event_ids": [event["id"]],
            "demo": event["demo"],
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "decided_by": None,
            "decision_note": None,
        }
        self.alerts.insert(0, alert)
        del self.alerts[200:]
        return alert

    def decide_alert(self, alert_id: str, approve: bool, operator: str, note: str) -> dict[str, Any]:
        alert = next((a for a in self.alerts if a["id"] == alert_id), None)
        if alert is None:
            raise LookupError(alert_id)
        alert["status"] = "approved" if approve else "rejected"
        alert["decided_by"] = sanitize_text(operator, 64)
        alert["decision_note"] = sanitize_text(note, 500)
        alert["updated_at"] = self.clock().isoformat()
        self.record_audit("alert.approve" if approve else "alert.reject", operator, alert_id, {"note": alert["decision_note"]})
        return alert
