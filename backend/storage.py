"""Supabase persistence via PostgREST, using the service-role key server-side only.

Boundaries (tested in backend/tests/test_storage.py):
* No network call is ever made when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset.
* The service-role key is never returned by any API response (`public_config` only exposes
  the anon key, which is designed to be public and constrained by RLS).
* Write failures never break ingestion: rows go to a bounded in-memory outbox that is
  retried on the next write, and the API reports `persistence: "degraded"`.
"""
from __future__ import annotations

import logging
import threading
from collections import deque
from typing import Any

import requests

try:
    from .config import Settings, settings as default_settings
except ImportError:  # pragma: no cover
    from config import Settings, settings as default_settings

log = logging.getLogger("bhudrishti.storage")

TABLES = (
    "events", "ingestion_logs", "devices", "alerts", "model_decisions", "coverage_samples",
    "audit_events", "notifications", "translations", "agent_runs",
)


class SupabaseStore:
    def __init__(self, cfg: Settings | None = None, session: requests.Session | None = None, outbox_size: int = 1000) -> None:
        cfg = cfg or default_settings
        self.url = cfg.supabase_url
        self.key = cfg.supabase_service_key
        self.session = session or requests.Session()
        self.outbox: deque[tuple[str, dict[str, Any], str | None]] = deque(maxlen=outbox_size)
        self.last_error: str | None = None
        self._lock = threading.Lock()

    @property
    def configured(self) -> bool:
        return bool(self.url and self.key)

    def status(self) -> dict[str, Any]:
        return {"configured": self.configured, "outbox": len(self.outbox),
                "state": "disabled" if not self.configured else ("degraded" if self.outbox or self.last_error else "ok"),
                "last_error": self.last_error}

    def _headers(self, prefer: str = "return=minimal") -> dict[str, str]:
        if not self.configured:
            raise RuntimeError("Supabase is not configured")
        return {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json", "Prefer": prefer}

    # ── low level ──
    def _post(self, table: str, rows: dict[str, Any] | list[dict[str, Any]], on_conflict: str | None = None) -> None:
        if table not in TABLES:
            raise ValueError(f"unknown table {table}")
        params = {"on_conflict": on_conflict} if on_conflict else None
        prefer = "return=minimal" + (",resolution=merge-duplicates" if on_conflict else "")
        response = self.session.post(f"{self.url}/rest/v1/{table}", headers=self._headers(prefer), params=params, json=rows, timeout=8)
        response.raise_for_status()

    def write(self, table: str, row: dict[str, Any], on_conflict: str | None = None) -> bool:
        """Best-effort write. Returns True if persisted now, False if disabled or queued."""
        if not self.configured:
            return False
        with self._lock:
            self._drain_locked(limit=20)
            try:
                self._post(table, row, on_conflict)
                self.last_error = None
                return True
            except requests.RequestException as exc:
                self.last_error = f"{table}: {type(exc).__name__}"
                log.warning("supabase write to %s failed; queued (%s)", table, type(exc).__name__)
                self.outbox.append((table, row, on_conflict))
                return False

    def _drain_locked(self, limit: int) -> None:
        for _ in range(min(limit, len(self.outbox))):
            table, row, conflict = self.outbox[0]
            try:
                self._post(table, row, conflict)
            except requests.RequestException:
                return
            self.outbox.popleft()

    def select(self, table: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        if table not in TABLES:
            raise ValueError(f"unknown table {table}")
        response = self.session.get(f"{self.url}/rest/v1/{table}", headers=self._headers("return=representation"), params=params, timeout=8)
        response.raise_for_status()
        return response.json()

    # ── domain mapping ──
    @staticmethod
    def event_row(event: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": event["id"], "node_id": event["node_id"], "node_name": event["node_name"],
            "device_id": event.get("device_id"), "lat": event["lat"], "lng": event["lng"],
            "recorded_at": event["recorded_at"], "received_at": event.get("received_at"),
            "source": event["source"], "channel": event.get("channel", "unknown"), "transport": event.get("transport", "unknown"),
            "queued": event.get("queued", False), "client_event_id": event.get("client_event_id"),
            "confirmation": event["confirmation"], "classification": event["classification"]["classification"],
            "confidence": event["classification"]["confidence"], "alert_confidence": event.get("alert_confidence", 0),
            "features": event["classification"]["features"], "quality": event.get("quality", {}),
            "cross_confirmation": event.get("cross_confirmation", {}), "telemetry": event["telemetry"],
            "is_demo": event.get("demo", False),
        }

    @staticmethod
    def row_to_event(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"], "node_id": row["node_id"], "node_name": row["node_name"], "device_id": row.get("device_id"),
            "lat": row["lat"], "lng": row["lng"], "recorded_at": row["recorded_at"], "received_at": row.get("received_at"),
            "source": row["source"], "channel": row.get("channel", "unknown"), "transport": row.get("transport", "unknown"),
            "queued": row.get("queued", False), "client_event_id": row.get("client_event_id"),
            "confirmation": row["confirmation"], "telemetry": row["telemetry"], "quality": row.get("quality") or {},
            "cross_confirmation": row.get("cross_confirmation") or {}, "alert_confidence": row.get("alert_confidence", 0),
            "demo": row.get("is_demo", False),
            "classification": {"classification": row["classification"], "confidence": row["confidence"], "features": row["features"]},
        }

    def insert_event(self, event: dict[str, Any]) -> bool:
        ok = self.write("events", self.event_row(event), on_conflict="id")
        self.write("model_decisions", {
            "event_id": event["id"], "model": "logistic_regression_v1", "label": event["classification"]["classification"],
            "confidence": event["classification"]["confidence"], "features": event["classification"]["features"],
            "quality_flags": event.get("quality", {}).get("flags", []),
        })
        return ok

    def list_events(self, limit: int = 30) -> list[dict[str, Any]]:
        rows = self.select("events", {"select": "*", "order": "recorded_at.desc", "limit": limit})
        return [self.row_to_event(r) for r in rows]

    def upsert_device(self, node: dict[str, Any]) -> bool:
        return self.write("devices", {
            "id": node["id"], "name": node.get("name", node["id"]), "kind": node.get("kind", "esp32" if node.get("source") != "phone_layer" else "phone"),
            "source": node.get("source", "esp32_node"), "lat": node.get("lat"), "lng": node.get("lng"),
            "status": node.get("status", "unknown"), "battery_pct": node.get("battery_pct"), "last_seen": node.get("last_seen"),
            "range_km": node.get("range_km"), "reliability": node.get("reliability"), "is_demo": bool(node.get("demo")),
        }, on_conflict="id")

    def list_devices(self) -> list[dict[str, Any]]:
        return self.select("devices", {"select": "*", "order": "id.asc", "limit": 500})

    def upsert_alert(self, alert: dict[str, Any]) -> bool:
        row = {k: alert.get(k) for k in ("id", "node_id", "node_name", "lat", "lng", "level", "status", "requires_approval",
                                          "confidence", "sources", "event_ids", "created_at", "updated_at", "decided_by", "decision_note")}
        row["is_demo"] = bool(alert.get("demo"))
        return self.write("alerts", row, on_conflict="id")

    def log_ingestion(self, entry: dict[str, Any]) -> bool:
        return self.write("ingestion_logs", entry)

    def audit(self, entry: dict[str, Any]) -> bool:
        return self.write("audit_events", entry)

    def agent_run(self, run: dict[str, Any]) -> bool:
        return self.write("agent_runs", run)

    def coverage_sample(self, summary: dict[str, Any]) -> bool:
        return self.write("coverage_samples", {"as_of": summary["as_of"], "max_age_minutes": summary["max_age_minutes"], "summary": summary})

    def cache_translation(self, row: dict[str, Any]) -> bool:
        return self.write("translations", row, on_conflict="cache_key")

    def notification(self, row: dict[str, Any]) -> bool:
        return self.write("notifications", row)


store = SupabaseStore()
