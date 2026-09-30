"""Runs sub-agents concurrently with timeouts and records provenance for every output."""
from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from .registry import ProviderRouter
from .subagents import AGENTS, FIRST_STAGE, SYSTEM_PROMPT, Agent, OperatorRecommendationAgent, extract_json


class Orchestrator:
    def __init__(self, router: ProviderRouter, concurrency: int = 3, agent_timeout_s: float = 12.0, use_llm: bool = True) -> None:
        self.router = router
        self.semaphore = asyncio.Semaphore(concurrency)
        self.agent_timeout_s = agent_timeout_s
        self.use_llm = use_llm

    async def run_agent(self, agent: Agent, ctx: dict[str, Any]) -> dict[str, Any]:
        started = time.monotonic()
        baseline = agent.rules(ctx)
        record: dict[str, Any] = {
            "agent": agent.name, "title": agent.title, "output": baseline, "provider": "rules", "model": "rules-v1",
            "used_fallback": True, "attempts": [], "requires_approval": agent.consequential, "llm_rejected": False,
        }
        if self.use_llm and self.router.candidates():
            async with self.semaphore:
                try:
                    outcome = await asyncio.wait_for(
                        self.router.complete(SYSTEM_PROMPT, agent.prompt(ctx), agent.max_tokens, self.agent_timeout_s),
                        timeout=self.agent_timeout_s * 2)
                    record["attempts"] = outcome.attempts
                    if outcome.result:
                        parsed = extract_json(outcome.result.text)
                        merged = agent.accept(parsed, baseline) if parsed else None
                        if merged is None:
                            record["llm_rejected"] = True
                        else:
                            record.update(output=merged, provider=outcome.result.provider, model=outcome.result.model, used_fallback=False)
                except asyncio.TimeoutError:
                    record["attempts"].append({"provider": "router", "status": "error", "reason": "agent_timeout"})
        record["confidence"] = record["output"].get("confidence")
        record["latency_ms"] = int((time.monotonic() - started) * 1000)
        return record

    async def run(self, ctx: dict[str, Any], agent_names: list[str] | None = None) -> dict[str, Any]:
        started_at = datetime.now(timezone.utc).isoformat()
        wanted = set(agent_names or AGENTS)
        unknown = wanted - set(AGENTS)
        if unknown:
            raise ValueError(f"unknown agents: {', '.join(sorted(unknown))}")
        first = [cls() for cls in FIRST_STAGE if cls.name in wanted]
        results = await asyncio.gather(*(self.run_agent(agent, ctx) for agent in first))
        if OperatorRecommendationAgent.name in wanted:
            findings = {r["agent"]: r["output"] for r in results}
            results.append(await self.run_agent(OperatorRecommendationAgent(), {**ctx, "findings": findings}))
        return {
            "id": f"run-{uuid.uuid4().hex[:12]}", "started_at": started_at, "finished_at": datetime.now(timezone.utc).isoformat(),
            "agents": results, "requires_approval": any(r["requires_approval"] for r in results),
            "providers_used": sorted({r["provider"] for r in results}),
            "note": "Agent outputs are advisory. Rules baselines always run; LLM refinements are validated and cannot downgrade rule findings.",
        }
