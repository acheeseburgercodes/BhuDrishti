import os
import sys
from pathlib import Path

# Never let a developer's real .env (Supabase / provider keys) leak into tests.
os.environ["BHUDRISHTI_NO_DOTENV"] = "1"
for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SARVAM_API_KEY", "BHUDRISHTI_OPERATOR_TOKEN", "BHUDRISHTI_DEVICE_KEY",
             "XAI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "HF_API_TOKEN", "OLLAMA_BASE_URL"):
    os.environ.pop(name, None)
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def api(monkeypatch):
    from fastapi.testclient import TestClient

    import backend.main as main
    from backend.rate_limit import TokenBucketLimiter

    main.service.events.clear()
    main.service.alerts.clear()
    main.service.ingestion_log.clear()
    main.service.idempotency = type(main.service.idempotency)()
    monkeypatch.setattr(main, "limiter", TokenBucketLimiter(10000, burst=10000))
    return TestClient(main.app), main


def ambient(n=160):
    import random
    rng = random.Random(1)
    return [rng.gauss(0, 0.03) for _ in range(n)]


def impulse(n=160):
    import math
    return [1.4 * math.sin(2 * math.pi * 18 * i / 100) * math.exp(-4 * max(i / 100 - 0.05, 0)) for i in range(n)]
