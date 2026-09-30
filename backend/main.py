"""BhuDrishti API — ingestion, coverage, alerts, agents and language services.

Runs fully in labelled demo mode without any environment variables. See docs/API.md.
"""
from __future__ import annotations

import hmac
import json
import logging
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import requests
from fastapi import Depends, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:  # Supports both `uvicorn main:app` from backend/ and `uvicorn backend.main:app`.
    from .config import settings
    from .contracts import AlertDecisionIn, BatchIn, SimulationIn, TelemetryIn
    from .coverage import compute_coverage
    from .ingestion import IngestionService, sanitize_text
    from .ml.classifier import classify
    from .rate_limit import TokenBucketLimiter
    from .storage import store
except ImportError:
    from config import settings
    from contracts import AlertDecisionIn, BatchIn, SimulationIn, TelemetryIn
    from coverage import compute_coverage
    from ingestion import IngestionService, sanitize_text
    from ml.classifier import classify
    from rate_limit import TokenBucketLimiter
    from storage import store

log = logging.getLogger("bhudrishti")
ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = ROOT / "nepal-flood-corridor-seed-data.json"
LOOPBACK = {"127.0.0.1", "::1", "localhost", "testclient"}


def fallback_seed() -> dict[str, Any]:
    return {
        "region": "Trishuli-Bhote Koshi flood corridor, Nepal", "is_demo": True,
        "nodes": [
            {"id": "BD-001", "name": "Rasuwa Glacier Gate", "lat": 28.285, "lng": 85.383, "status": "online", "battery_pct": 92, "source": "esp32_node"},
            {"id": "BD-002", "name": "Syabrubesi", "lat": 28.161, "lng": 85.345, "status": "online", "battery_pct": 78, "source": "esp32_node"},
        ],
        "settlements": [], "coverage_gaps": [],
    }


def load_seed() -> dict[str, Any]:
    try:
        return json.loads(SEED_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return fallback_seed()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


seed = load_seed()
nodes: list[dict[str, Any]] = seed.get("nodes", [])
settlements: list[dict[str, Any]] = seed.get("settlements", [])
coverage_gaps: list[dict[str, Any]] = seed.get("coverage_gaps", [])
service = IngestionService(nodes, classify)
events = service.events  # backwards-compatible module attribute
limiter = TokenBucketLimiter(settings.ingest_rate_per_min)


def apply_demo_clock() -> None:
    """Demo mode: make fixture freshness relative to now, and label every fixture node."""
    now = datetime.now(timezone.utc)
    for node in nodes:
        offset = node.pop("demo_last_seen_offset_s", None)
        if settings.demo_mode:
            node["demo"] = True
            if offset is not None:
                node["last_seen"] = (now - timedelta(seconds=offset)).isoformat()
        else:
            node["demo"] = bool(seed.get("is_demo"))


apply_demo_clock()


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        for connection in list(self.connections):
            try:
                await connection.send_json(message)
            except Exception:  # noqa: BLE001 - drop broken sockets
                self.disconnect(connection)


manager = ConnectionManager()
app = FastAPI(title="BhuDrishti API", version="0.2.0", description="Flood-corridor early-warning prototype (not a certified warning system)")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


# ── auth helpers ──────────────────────────────────────────────────────────────
def client_host(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def require_operator(request: Request) -> str:
    """Privileged actions: operator token if configured, otherwise loopback-only (demo)."""
    token = request.headers.get("x-operator-token", "")
    if settings.operator_token:
        if not hmac.compare_digest(token, settings.operator_token):
            raise HTTPException(status_code=401, detail="operator token required")
        return "operator"
    if client_host(request) not in LOOPBACK:
        raise HTTPException(status_code=403, detail="set BHUDRISHTI_OPERATOR_TOKEN to allow remote operator actions")
    return "local-demo-operator"


def check_device(request: Request) -> None:
    if settings.device_key and not hmac.compare_digest(request.headers.get("x-device-key", ""), settings.device_key):
        raise HTTPException(status_code=401, detail="device key required")


def rate_limit(request: Request) -> None:
    if not limiter.allow(client_host(request)):
        raise HTTPException(status_code=429, detail="ingest rate limit exceeded", headers={"Retry-After": "5"})


def mode() -> str:
    return "live" if settings.supabase_configured else "demo"


# ── read endpoints ────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "bhudrishti-api", "version": app.version, "mode": mode(), "nodes": len(nodes),
            "events": len(events), "supabase": store.configured, "persistence": store.status(), "time": utc_now()}


@app.get("/api/config")
async def public_config() -> dict[str, Any]:
    """Public, non-secret configuration for web/mobile clients."""
    try:
        from .agents.registry import provider_catalog
        from .sarvam import sarvam
    except ImportError:
        from agents.registry import provider_catalog
        from sarvam import sarvam
    realtime = None
    if settings.public_supabase_url and settings.public_supabase_anon_key:
        realtime = {"url": settings.public_supabase_url, "anon_key": settings.public_supabase_anon_key}
    return {
        "mode": mode(), "demo": settings.demo_mode, "region": seed.get("region"), "seed_is_demo": bool(seed.get("is_demo")),
        "realtime": realtime, "operator_auth": "token" if settings.operator_token else "loopback-only",
        "device_key_required": bool(settings.device_key), "languages": sarvam.capabilities(),
        "agent_providers": provider_catalog(), "disclaimer": "Prototype early-warning system. Not certified for life-safety use.",
    }


@app.get("/api/model")
async def get_model_info() -> dict[str, Any]:
    try:
        from .model import ARTIFACT, FEATURES
    except ImportError:
        from model import ARTIFACT, FEATURES
    coeffs = ARTIFACT.get("coefficients", [[]])[0]
    total = sum(abs(c) for c in coeffs) or 1
    return {
        "model_type": "Logistic Regression (sklearn)", "features": FEATURES,
        "training_samples": ARTIFACT.get("training_samples"), "validation_samples": ARTIFACT.get("validation_samples"),
        "validation_accuracy": ARTIFACT.get("validation_accuracy"), "validation_balanced_accuracy": ARTIFACT.get("validation_balanced_accuracy"),
        "feature_importances": [{"feature": f, "coefficient": round(c, 4), "importance": round(abs(c) / total, 4)} for f, c in zip(FEATURES, coeffs)],
        "labels": ARTIFACT.get("labels", ["normal", "event"]),
        "note": "Trained and validated on synthetic vibration windows only; accuracy on real field data is unknown.",
    }


@app.post("/api/classify")
async def classify_window(window: list[float]) -> dict[str, Any]:
    try:
        return classify(window)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/nodes")
async def get_nodes() -> list[dict[str, Any]]:
    return nodes


@app.get("/api/devices")
async def get_devices() -> list[dict[str, Any]]:
    if store.configured:
        try:
            rows = store.list_devices()
            if rows:
                return rows
        except requests.RequestException as exc:
            log.warning("device registry read failed: %s", type(exc).__name__)
    return nodes


@app.get("/api/settlements")
async def get_settlements() -> list[dict[str, Any]]:
    result = []
    for settlement in settlements:
        nearest = service.find_node(settlement.get("nearest_node", ""))
        connected = nearest is not None and nearest.get("status") != "offline"
        result.append({**settlement, "connectivity_status": "connected" if connected else "degraded", "phone_layer_active": connected})
    return result


@app.get("/api/coverage-gaps")
async def get_coverage_gaps() -> list[dict[str, Any]]:
    return coverage_gaps


@app.get("/api/coverage")
async def get_coverage(max_age_minutes: float = Query(60, ge=5, le=1440), as_of: str | None = None) -> dict[str, Any]:
    at = None
    if as_of:
        try:
            at = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="as_of must be ISO-8601") from exc
    result = compute_coverage(nodes, settlements, as_of=at, max_age_minutes=max_age_minutes)
    result["summary"]["demo"] = any(n.get("demo") for n in nodes)
    return result


@app.get("/api/events")
async def get_events(limit: int = 30) -> list[dict[str, Any]]:
    bounded = max(1, min(limit, 100))
    if store.configured:
        try:
            return store.list_events(bounded)
        except requests.RequestException as exc:
            log.warning("supabase event query failed, serving memory buffer: %s", type(exc).__name__)
    return events[:bounded]


@app.get("/api/alerts")
async def get_alerts(status: str | None = Query(None, pattern="^(pending_approval|approved|rejected|open)$")) -> list[dict[str, Any]]:
    return [a for a in service.alerts if status is None or a["status"] == status]


@app.get("/api/ingestion-log")
async def get_ingestion_log(limit: int = Query(50, ge=1, le=500)) -> list[dict[str, Any]]:
    return service.ingestion_log[:limit]


@app.get("/api/audit")
async def get_audit(actor: str = Depends(require_operator), limit: int = Query(100, ge=1, le=500)) -> list[dict[str, Any]]:
    return service.audit[:limit]


# ── ingestion ─────────────────────────────────────────────────────────────────
async def _ingest_one(telemetry: TelemetryIn, client: str) -> dict[str, Any]:
    try:
        event, duplicate = service.process(telemetry, client)
    except LookupError as exc:
        service.log("rejected", telemetry, client, str(exc))
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if duplicate:
        return {**event, "duplicate": True}
    persisted = store.insert_event(event)
    node = service.find_node(event["node_id"])
    if node:
        store.upsert_device(node)
    store.log_ingestion(service.ingestion_log[0])
    alert = next((a for a in service.alerts if a["id"] == event.get("alert_id")), None)
    if alert:
        store.upsert_alert(alert)
    event["persistence"] = "supabase" if persisted else ("degraded" if store.configured else "memory")
    await manager.broadcast({"type": "telemetry", "event": event})
    if alert:
        await manager.broadcast({"type": "alert", "alert": alert})
    return event


@app.post("/api/ingest", dependencies=[Depends(check_device), Depends(rate_limit)])
async def ingest(telemetry: TelemetryIn, request: Request) -> dict[str, Any]:
    return await _ingest_one(telemetry, client_host(request))


@app.post("/api/ingest/batch", dependencies=[Depends(check_device), Depends(rate_limit)])
async def ingest_batch(batch: BatchIn, request: Request) -> dict[str, Any]:
    """Offline-queue flush: per-item results so clients can drop accepted items only."""
    results = []
    for reading in batch.readings:
        try:
            event = await _ingest_one(reading, client_host(request))
            results.append({"client_event_id": reading.client_event_id, "status": "duplicate" if event.get("duplicate") else "accepted", "event_id": event["id"]})
        except HTTPException as exc:
            results.append({"client_event_id": reading.client_event_id, "status": "rejected", "detail": exc.detail})
    return {"results": results}


# ── alerts (privileged) ───────────────────────────────────────────────────────
async def _decide(alert_id: str, body: AlertDecisionIn, actor: str, approve: bool) -> dict[str, Any]:
    try:
        alert = service.decide_alert(alert_id, approve, f"{actor}:{body.operator}", body.note)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="alert not found") from exc
    store.upsert_alert(alert)
    store.audit(service.audit[0])
    if approve:
        # Approved text is recorded; actual delivery (SMS/siren/app push) is out of scope here.
        try:
            from .sarvam import template_message
        except ImportError:
            from sarvam import template_message
        message = template_message(alert["level"], "en", alert["node_name"])
        alert["notification"] = {"lang": "en", "body": message["text"], "status": "approved", "provider": message["provider"]}
        store.notification({"alert_id": alert["id"], **alert["notification"]})
    await manager.broadcast({"type": "alert", "alert": alert})
    return alert


@app.post("/api/alerts/{alert_id}/approve")
async def approve_alert(alert_id: str, body: AlertDecisionIn, actor: str = Depends(require_operator)) -> dict[str, Any]:
    return await _decide(alert_id, body, actor, True)


@app.post("/api/alerts/{alert_id}/reject")
async def reject_alert(alert_id: str, body: AlertDecisionIn, actor: str = Depends(require_operator)) -> dict[str, Any]:
    return await _decide(alert_id, body, actor, False)


# ── simulator (always labelled demo) ──────────────────────────────────────────
@app.post("/api/simulate-event")
async def simulate_event(request_body: SimulationIn, request: Request) -> dict[str, Any]:
    node_id = request_body.node_id or random.choice([n for n in nodes if n.get("source", "esp32_node") == "esp32_node"] or nodes)["id"]
    if service.find_node(node_id) is None:
        raise HTTPException(status_code=404, detail=f"Unknown node: {node_id}")
    severity = request_body.severity
    ranges = {
        "normal": ((70, 145), (0, 20), (300, 1000), (30, 65)),
        "watch": ((150, 250), (20, 75), (900, 2200), (55, 85)),
        "critical": ((260, 390), (70, 180), (2200, 4200), (75, 99)),
        "random": ((75, 350), (0, 160), (300, 3800), (25, 99)),
    }[severity]
    water, rain, flow, soil = (random.uniform(*r) for r in ranges)
    n = 160
    t = np.arange(n) / 100
    rng = np.random.default_rng()
    if severity == "normal":
        window = rng.normal(0, 0.06, n)
    else:
        amplitude = {"watch": 0.8, "critical": 1.6, "random": 1.2}[severity]
        window = amplitude * np.sin(2 * math.pi * 18 * t) * np.exp(-3 * np.maximum(t - 0.08, 0)) + rng.normal(0, 0.06, n)
    telemetry = TelemetryIn(
        node_id=node_id, sensor_window=window.tolist(), source=request_body.source, channel="simulator", demo=True,
        water_level_cm=round(water, 1), rainfall_mm=round(rain, 1), flow_rate_m3s=round(flow, 1),
        soil_moisture_pct=round(soil, 1), battery_pct=round(random.uniform(45, 98), 1), temperature_c=round(random.uniform(16, 29), 1),
    )
    return await _ingest_one(telemetry, client_host(request))


# ── realtime ──────────────────────────────────────────────────────────────────
@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        await websocket.send_json({"type": "snapshot", "events": events[:20], "nodes": nodes, "alerts": service.alerts[:20], "mode": mode()})
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong", "time": utc_now()})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:  # noqa: BLE001
        manager.disconnect(websocket)


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": sanitize_text(exc, 300)})


try:  # Agent + language routes live in their own module.
    from .routes_ai import router as ai_router
except ImportError:
    from routes_ai import router as ai_router
app.include_router(ai_router)
