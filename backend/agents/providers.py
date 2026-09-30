"""LLM provider adapters behind one small interface.

No adapter makes a network call unless its API key / base URL is configured. Costs and
limits change; see docs/PROVIDERS.md. `GrokBot` is the xAI adapter and is a paid API
(xAI may grant promotional credits, but it should not be assumed to be free).
"""
from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import requests


class ProviderError(Exception):
    def __init__(self, kind: str, message: str = "", retry_after_s: float | None = None) -> None:
        super().__init__(message or kind)
        self.kind = kind  # unavailable | rate_limited | timeout | auth | bad_response | network
        self.retry_after_s = retry_after_s


@dataclass
class ProviderResult:
    text: str
    provider: str
    model: str
    latency_ms: int


@dataclass
class ProviderHealth:
    calls: int = 0
    failures: int = 0
    consecutive_failures: int = 0
    cooldown_until: float = 0.0
    last_error: str | None = None
    last_latency_ms: int | None = None

    def available(self, now: float) -> bool:
        return now >= self.cooldown_until

    def record_success(self, latency_ms: int) -> None:
        self.calls += 1
        self.consecutive_failures = 0
        self.last_error = None
        self.last_latency_ms = latency_ms

    def record_failure(self, error: ProviderError, now: float) -> None:
        self.calls += 1
        self.failures += 1
        self.consecutive_failures += 1
        self.last_error = error.kind
        if error.kind == "rate_limited":
            self.cooldown_until = now + (error.retry_after_s or 60)
        elif error.kind == "auth":
            self.cooldown_until = now + 3600
        elif self.consecutive_failures >= 3:  # simple circuit breaker
            self.cooldown_until = now + min(600, 30 * 2 ** (self.consecutive_failures - 3))


@dataclass
class Provider:
    name: str
    label: str
    cost: str  # "local" | "free-tier" | "paid" | "test"
    privacy: str
    model: str = ""
    health: ProviderHealth = field(default_factory=ProviderHealth)
    clock: Callable[[], float] = time.monotonic

    def configured(self) -> bool:  # pragma: no cover - overridden
        return False

    def _call(self, system: str, prompt: str, max_tokens: int, timeout: float) -> str:  # pragma: no cover
        raise ProviderError("unavailable")

    async def complete(self, system: str, prompt: str, max_tokens: int = 400, timeout: float = 12.0) -> ProviderResult:
        if not self.configured():
            raise ProviderError("unavailable", f"{self.name} not configured")
        start = self.clock()
        try:
            text = await asyncio.wait_for(asyncio.to_thread(self._call, system, prompt, max_tokens, timeout), timeout=timeout + 1)
        except asyncio.TimeoutError as exc:
            error = ProviderError("timeout")
            self.health.record_failure(error, self.clock())
            raise error from exc
        except ProviderError as error:
            self.health.record_failure(error, self.clock())
            raise
        latency = int((self.clock() - start) * 1000)
        self.health.record_success(latency)
        return ProviderResult(text=text, provider=self.name, model=self.model, latency_ms=latency)

    def describe(self) -> dict[str, Any]:
        return {"name": self.name, "label": self.label, "cost": self.cost, "privacy": self.privacy, "configured": self.configured(),
                "model": self.model if self.configured() else None, "available": self.health.available(self.clock()),
                "last_error": self.health.last_error, "last_latency_ms": self.health.last_latency_ms}


def _raise_for_http(response: requests.Response) -> None:
    if response.status_code == 429:
        retry = response.headers.get("retry-after")
        raise ProviderError("rate_limited", "429", float(retry) if retry and retry.replace(".", "", 1).isdigit() else None)
    if response.status_code in (401, 403):
        raise ProviderError("auth", str(response.status_code))
    if response.status_code >= 400:
        raise ProviderError("unavailable", f"HTTP {response.status_code}")


@dataclass
class OpenAICompatibleProvider(Provider):
    base_url: str = ""
    key_env: str = ""
    extra_headers: dict[str, str] = field(default_factory=dict)

    def configured(self) -> bool:
        return bool(os.getenv(self.key_env)) and bool(self.model)

    def _call(self, system: str, prompt: str, max_tokens: int, timeout: float) -> str:
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {os.getenv(self.key_env, '')}", "Content-Type": "application/json", **self.extra_headers},
                json={"model": self.model, "max_tokens": max_tokens, "temperature": 0.1,
                      "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]},
                timeout=timeout,
            )
        except requests.Timeout as exc:
            raise ProviderError("timeout") from exc
        except requests.RequestException as exc:
            raise ProviderError("network", type(exc).__name__) from exc
        _raise_for_http(response)
        try:
            return response.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError("bad_response") from exc


@dataclass
class GeminiProvider(Provider):
    def configured(self) -> bool:
        return bool(os.getenv("GEMINI_API_KEY")) and bool(self.model)

    def _call(self, system: str, prompt: str, max_tokens: int, timeout: float) -> str:
        try:
            response = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent",
                headers={"x-goog-api-key": os.getenv("GEMINI_API_KEY", ""), "Content-Type": "application/json"},
                json={"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                      "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.1}},
                timeout=timeout,
            )
        except requests.Timeout as exc:
            raise ProviderError("timeout") from exc
        except requests.RequestException as exc:
            raise ProviderError("network", type(exc).__name__) from exc
        _raise_for_http(response)
        try:
            return response.json()["candidates"][0]["content"]["parts"][0]["text"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError("bad_response") from exc


@dataclass
class OllamaProvider(Provider):
    def configured(self) -> bool:
        return bool(os.getenv("OLLAMA_BASE_URL")) and bool(self.model)

    def _call(self, system: str, prompt: str, max_tokens: int, timeout: float) -> str:
        base = os.getenv("OLLAMA_BASE_URL", "").rstrip("/")
        try:
            response = requests.post(f"{base}/api/chat", json={
                "model": self.model, "stream": False, "options": {"num_predict": max_tokens, "temperature": 0.1},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}, timeout=timeout)
        except requests.Timeout as exc:
            raise ProviderError("timeout") from exc
        except requests.RequestException as exc:
            raise ProviderError("network", type(exc).__name__) from exc
        _raise_for_http(response)
        try:
            return response.json()["message"]["content"]
        except (ValueError, KeyError, TypeError) as exc:
            raise ProviderError("bad_response") from exc


@dataclass
class MockProvider(Provider):
    """Scripted provider for tests: each entry is a str (response) or ProviderError."""
    script: list[Any] = field(default_factory=list)
    delay_s: float = 0.0
    prompts: list[str] = field(default_factory=list)

    def configured(self) -> bool:
        return True

    def _call(self, system: str, prompt: str, max_tokens: int, timeout: float) -> str:
        self.prompts.append(prompt)
        if self.delay_s:
            time.sleep(self.delay_s)
        item = self.script.pop(0) if self.script else ProviderError("unavailable", "script exhausted")
        if isinstance(item, Exception):
            raise item
        return item


@dataclass
class GrokBot(OpenAICompatibleProvider):
    """xAI Grok adapter (OpenAI-compatible API). Paid; requires XAI_API_KEY and XAI_MODEL."""
    name: str = "grok"
    label: str = "GrokBot (xAI)"
    cost: str = "paid"
    privacy: str = "Prompts sent to xAI; review xAI data-sharing terms before enabling."
    model: str = field(default_factory=lambda: os.getenv("XAI_MODEL", ""))
    base_url: str = "https://api.x.ai/v1"
    key_env: str = "XAI_API_KEY"


def default_providers() -> dict[str, Provider]:
    return {
        "ollama": OllamaProvider(name="ollama", label="Ollama (local)", cost="local", privacy="Runs on your own machine; no data leaves it.",
                                 model=os.getenv("OLLAMA_MODEL", "")),
        "groq": OpenAICompatibleProvider(name="groq", label="Groq (open models)", cost="free-tier", privacy="Prompts sent to Groq cloud.",
                                         model=os.getenv("GROQ_MODEL", ""), base_url="https://api.groq.com/openai/v1", key_env="GROQ_API_KEY"),
        "openrouter": OpenAICompatibleProvider(name="openrouter", label="OpenRouter (:free routes)", cost="free-tier",
                                               privacy="Prompts routed to third-party hosts; free routes may log prompts.",
                                               model=os.getenv("OPENROUTER_MODEL", ""), base_url="https://openrouter.ai/api/v1", key_env="OPENROUTER_API_KEY",
                                               extra_headers={"X-Title": "BhuDrishti"}),
        "gemini": GeminiProvider(name="gemini", label="Google Gemini API", cost="free-tier",
                                 privacy="Free-tier prompts may be used by Google to improve products.", model=os.getenv("GEMINI_MODEL", "")),
        "huggingface": OpenAICompatibleProvider(name="huggingface", label="Hugging Face Inference Providers", cost="free-tier",
                                                privacy="Prompts sent to the selected inference provider.", model=os.getenv("HF_MODEL", ""),
                                                base_url="https://router.huggingface.co/v1", key_env="HF_API_TOKEN"),
        "grok": GrokBot(),
    }
