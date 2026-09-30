"""Provider routing: ordered fallback with health/rate-limit awareness."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .providers import Provider, ProviderError, ProviderResult, default_providers

DEFAULT_ORDER = ["ollama", "groq", "openrouter", "gemini", "huggingface", "grok"]


@dataclass
class RouteOutcome:
    result: ProviderResult | None
    attempts: list[dict[str, Any]] = field(default_factory=list)


class ProviderRouter:
    def __init__(self, providers: dict[str, Provider] | None = None, order: list[str] | None = None) -> None:
        self.providers = providers if providers is not None else default_providers()
        wanted = [p for p in (order or DEFAULT_ORDER) if p != "rules"]
        self.order = [p for p in wanted if p in self.providers] + [p for p in self.providers if p not in wanted]

    def candidates(self) -> list[Provider]:
        return [self.providers[name] for name in self.order if self.providers[name].configured()]

    async def complete(self, system: str, prompt: str, max_tokens: int = 400, timeout: float = 12.0) -> RouteOutcome:
        outcome = RouteOutcome(result=None)
        for provider in self.candidates():
            if not provider.health.available(provider.clock()):
                outcome.attempts.append({"provider": provider.name, "status": "skipped", "reason": "cooldown"})
                continue
            try:
                outcome.result = await provider.complete(system, prompt, max_tokens, timeout)
                outcome.attempts.append({"provider": provider.name, "status": "ok", "latency_ms": outcome.result.latency_ms})
                return outcome
            except ProviderError as error:
                outcome.attempts.append({"provider": provider.name, "status": "error", "reason": error.kind})
        outcome.attempts.append({"provider": "rules", "status": "fallback"})
        return outcome

    def describe(self) -> list[dict[str, Any]]:
        described = [self.providers[name].describe() for name in self.order]
        described.append({"name": "rules", "label": "Deterministic rules engine", "cost": "local", "configured": True, "available": True,
                          "privacy": "In-process; no data leaves the server.", "model": "rules-v1"})
        return described


_router: ProviderRouter | None = None


def get_router() -> ProviderRouter:
    global _router
    if _router is None:
        try:
            from ..config import settings
        except ImportError:  # pragma: no cover
            from config import settings
        _router = ProviderRouter(order=settings.agent_provider_order or None)
    return _router


def set_router(router: ProviderRouter | None) -> None:
    global _router
    _router = router


def provider_catalog() -> list[dict[str, Any]]:
    return [{k: p[k] for k in ("name", "label", "cost", "configured", "available")} for p in get_router().describe()]
