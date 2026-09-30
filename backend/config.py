"""Runtime configuration read from environment variables (names in .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
if not os.getenv("BHUDRISHTI_NO_DOTENV"):  # tests set this so a local .env never leaks in
    load_dotenv(ROOT / ".env")
    load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "") or default)
    except ValueError:
        return default


@dataclass
class Settings:
    supabase_url: str = field(default_factory=lambda: os.getenv("SUPABASE_URL", "").rstrip("/"))
    supabase_service_key: str = field(default_factory=lambda: os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
    # Public values the browser may use for Realtime (anon key is RLS-constrained).
    public_supabase_url: str = field(default_factory=lambda: os.getenv("VITE_SUPABASE_URL", "") or os.getenv("SUPABASE_URL", "").rstrip("/"))
    public_supabase_anon_key: str = field(default_factory=lambda: os.getenv("VITE_SUPABASE_ANON_KEY", "") or os.getenv("SUPABASE_ANON_KEY", ""))
    operator_token: str = field(default_factory=lambda: os.getenv("BHUDRISHTI_OPERATOR_TOKEN", ""))
    device_key: str = field(default_factory=lambda: os.getenv("BHUDRISHTI_DEVICE_KEY", ""))
    ingest_rate_per_min: int = field(default_factory=lambda: _int("BHUDRISHTI_INGEST_RATE_PER_MIN", 120))
    cors_origins: list[str] = field(default_factory=lambda: [o.strip() for o in os.getenv("BHUDRISHTI_CORS_ORIGINS", "").split(",") if o.strip()] or ["*"])
    sarvam_api_key: str = field(default_factory=lambda: os.getenv("SARVAM_API_KEY", ""))
    agent_timeout_s: float = field(default_factory=lambda: _float("AGENT_TIMEOUT_SECONDS", 12.0))
    agent_provider_order: list[str] = field(default_factory=lambda: [p.strip() for p in os.getenv("AGENT_PROVIDER_ORDER", "").split(",") if p.strip()])

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_key)

    @property
    def demo_mode(self) -> bool:
        return not self.supabase_configured


settings = Settings()
