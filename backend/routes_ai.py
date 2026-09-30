"""Agent orchestration and language endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

try:
    from .agents.orchestrator import Orchestrator
    from .agents.registry import get_router
    from .config import settings
    from .contracts import AgentRunIn, TranslateIn
    from .ingestion import sanitize_text
    from .sarvam import sarvam, template_message
    from .storage import store
except ImportError:  # pragma: no cover
    from agents.orchestrator import Orchestrator
    from agents.registry import get_router
    from config import settings
    from contracts import AgentRunIn, TranslateIn
    from ingestion import sanitize_text
    from sarvam import sarvam, template_message
    from storage import store

router = APIRouter()
agent_runs: list[dict[str, Any]] = []
sarvam.on_cache_write = store.cache_translation


def _main():
    try:
        from . import main
    except ImportError:  # pragma: no cover
        import main
    return main


def _operator(request: Request) -> str:
    return _main().require_operator(request)


def build_agent_context(event_id: str | None) -> dict[str, Any]:
    """Compact, sanitised context. No raw telemetry windows, tokens or free-form logs."""
    try:
        from .coverage import compute_coverage
    except ImportError:  # pragma: no cover
        from coverage import compute_coverage
    from datetime import datetime, timezone

    m = _main()
    events = m.service.events
    event = next((e for e in events if e["id"] == event_id), None) if event_id else (events[0] if events else None)
    now = datetime.now(timezone.utc)
    try:
        from .coverage import _parse
    except ImportError:  # pragma: no cover
        from coverage import _parse
    nodes = []
    for n in m.nodes[:40]:
        seen = _parse(n.get("last_seen"))
        minutes = None if seen is None else (now - seen).total_seconds() / 60
        state = "never" if minutes is None else "live" if minutes <= 2 else "recent" if minutes <= 15 else "stale" if minutes <= 60 else "offline"
        nodes.append({"id": sanitize_text(n["id"], 64), "name": sanitize_text(n.get("name", ""), 80), "status": n.get("status"),
                      "battery_pct": n.get("battery_pct"), "freshness": state, "age": None if minutes is None else f"{round(minutes)} min"})
    cov = compute_coverage(m.nodes, m.settlements)
    top = sorted((f["properties"] | {"lat": f["geometry"]["coordinates"][0][0][1], "lng": f["geometry"]["coordinates"][0][0][0]}
                  for f in cov["features"]), key=lambda p: -p["gap"])[:5]
    alert = None
    if event and event.get("alert_id"):
        alert = next((a for a in m.service.alerts if a["id"] == event["alert_id"]), None)
    return {
        "event": None if not event else {
            "id": event["id"], "node": sanitize_text(event["node_name"], 80), "source": event["source"], "channel": event.get("channel"),
            "classification": event["classification"]["classification"], "model_confidence": event["classification"]["confidence"],
            "alert_confidence": event.get("alert_confidence", 0), "cross_confirmed": event.get("cross_confirmation", {}).get("cross_confirmed", False),
            "quality_flags": event.get("quality", {}).get("flags", []), "demo": event.get("demo", False)},
        "alert": None if not alert else {"id": alert["id"], "level": alert["level"], "node_name": sanitize_text(alert["node_name"], 80), "status": alert["status"]},
        "nodes": nodes,
        "coverage": {k: cov["summary"][k] for k in ("covered", "partial", "uncovered", "risk_weighted_coverage", "high_risk_uncovered")},
        "top_gaps": [{"lat": round(p["lat"], 3), "lng": round(p["lng"], 3), "gap": p["gap"], "risk": p["risk"]} for p in top],
    }


@router.get("/api/agents/providers")
async def agent_providers() -> list[dict[str, Any]]:
    return get_router().describe()


@router.get("/api/agents/runs")
async def list_agent_runs(limit: int = Query(20, ge=1, le=100)) -> list[dict[str, Any]]:
    return agent_runs[:limit]


@router.post("/api/agents/run")
async def run_agents(body: AgentRunIn, actor: str = Depends(_operator)) -> dict[str, Any]:
    ctx = build_agent_context(body.event_id)
    orchestrator = Orchestrator(get_router(), agent_timeout_s=settings.agent_timeout_s)
    try:
        run = await orchestrator.run(ctx, body.agents)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    run["requested_by"] = actor
    run["event_id"] = (ctx.get("event") or {}).get("id")
    run["demo"] = bool((ctx.get("event") or {}).get("demo"))
    draft = next((a for a in run["agents"] if a["agent"] == "notification_draft"), None)
    if draft and draft["output"].get("message") and body.language != "en":
        draft["translation"] = {"lang": body.language, **sarvam.translate(draft["output"]["message"], body.language)}
    agent_runs.insert(0, run)
    del agent_runs[100:]
    store.agent_run({"id": run["id"], "started_at": run["started_at"], "finished_at": run["finished_at"], "event_id": run["event_id"],
                     "requested_by": actor, "providers_used": run["providers_used"], "requires_approval": run["requires_approval"], "result": run})
    await _main().manager.broadcast({"type": "agent_run", "run": {"id": run["id"], "finished_at": run["finished_at"]}})
    return run


@router.get("/api/i18n/languages")
async def languages() -> list[dict[str, Any]]:
    return sarvam.capabilities()


@router.get("/api/alerts/{alert_id}/message")
async def alert_message(alert_id: str, lang: str = Query("en", pattern="^[a-z]{2}$")) -> dict[str, Any]:
    alert = next((a for a in _main().service.alerts if a["id"] == alert_id), None)
    if alert is None:
        raise HTTPException(status_code=404, detail="alert not found")
    message = template_message(alert["level"], lang, alert["node_name"])
    message["status"] = alert["status"]
    message["note"] = "Static template; Nepali/Hindi wording pending native-speaker review." if not message["reviewed"] else ""
    return message


@router.post("/api/translate")
async def translate(body: TranslateIn, actor: str = Depends(_operator)) -> dict[str, Any]:
    """Operator-only: arbitrary text translation spends Sarvam credits."""
    return sarvam.translate(body.text, body.target, body.source)


@router.post("/api/tts")
async def tts(body: TranslateIn, actor: str = Depends(_operator)) -> dict[str, Any]:
    return sarvam.tts(body.text, body.target.split("-")[0])
