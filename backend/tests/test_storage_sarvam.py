import json
from unittest.mock import MagicMock

import requests

from backend.config import Settings
from backend.sarvam import SarvamAdapter, template_message
from backend.storage import SupabaseStore

from .conftest import ambient

EVENT = {"id": "evt-1", "node_id": "BD-001", "node_name": "X", "lat": 28.0, "lng": 85.0, "recorded_at": "2026-09-30T00:00:00+00:00",
         "source": "esp32_node", "confirmation": "unconfirmed, single-source", "telemetry": {},
         "classification": {"classification": "normal", "confidence": 0.9, "features": {}}}


def configured_store(session):
    cfg = Settings(supabase_url="https://example.supabase.co", supabase_service_key="service-secret")
    return SupabaseStore(cfg, session=session)


def test_unconfigured_store_never_touches_network():
    session = MagicMock()
    store = SupabaseStore(Settings(supabase_url="", supabase_service_key=""), session=session)
    assert store.insert_event(EVENT) is False and store.upsert_device({"id": "BD-001"}) is False
    session.post.assert_not_called()
    assert store.status()["state"] == "disabled"


def test_configured_store_writes_events_and_decisions_with_server_key():
    session = MagicMock()
    session.post.return_value.raise_for_status.return_value = None
    store = configured_store(session)
    assert store.insert_event(EVENT) is True
    urls = [c.args[0] for c in session.post.call_args_list]
    assert urls == ["https://example.supabase.co/rest/v1/events", "https://example.supabase.co/rest/v1/model_decisions"]
    headers = session.post.call_args_list[0].kwargs["headers"]
    assert headers["Authorization"] == "Bearer service-secret" and "merge-duplicates" in headers["Prefer"]


def test_write_failure_is_queued_and_drained():
    session = MagicMock()
    session.post.side_effect = requests.ConnectionError("down")
    store = configured_store(session)
    assert store.write("events", {"id": "a"}) is False
    assert store.status()["state"] == "degraded" and len(store.outbox) == 1
    session.post.side_effect = None
    session.post.return_value.raise_for_status.return_value = None
    assert store.write("events", {"id": "b"}) is True
    assert len(store.outbox) == 0


def test_row_mapping_roundtrip():
    row = SupabaseStore.event_row({**EVENT, "channel": "mobile_app", "demo": True})
    back = SupabaseStore.row_to_event(row)
    assert back["channel"] == "mobile_app" and back["demo"] is True and back["classification"]["confidence"] == 0.9


def test_public_config_never_exposes_secrets(api, monkeypatch):
    client, main = api
    monkeypatch.setattr(main.settings, "supabase_service_key", "service-secret-xyz")
    monkeypatch.setattr(main.settings, "sarvam_api_key", "sarvam-secret-xyz")
    monkeypatch.setattr(main.settings, "operator_token", "op-secret-xyz")
    text = json.dumps(client.get("/api/config").json()) + json.dumps(client.get("/api/health").json())
    for secret in ("service-secret-xyz", "sarvam-secret-xyz", "op-secret-xyz"):
        assert secret not in text


def test_sarvam_fallback_cache_and_capabilities():
    offline = SarvamAdapter(api_key="")
    assert offline.translate("hello", "ne")["provider"] == "none"
    assert all(not c["translate"] for c in offline.capabilities())
    post = MagicMock()
    post.return_value.raise_for_status.return_value = None
    post.return_value.json.return_value = {"translated_text": "नमस्ते"}
    writes = []
    adapter = SarvamAdapter(api_key="sk-test", post=post, on_cache_write=writes.append)
    first = adapter.translate("hello", "ne")
    second = adapter.translate("hello", "ne")
    assert first == {"text": "नमस्ते", "provider": "sarvam", "cached": False} and second["cached"] is True
    assert post.call_count == 1 and post.call_args.kwargs["json"]["target_language_code"] == "ne-IN"
    assert post.call_args.kwargs["headers"]["api-subscription-key"] == "sk-test" and len(writes) == 1
    assert adapter.tts("नमस्ते", "ne")["audio_base64"] is None  # Nepali TTS not offered by Sarvam
    assert "sk-test" not in json.dumps(adapter.capabilities())
    post.side_effect = requests.Timeout()
    assert adapter.translate("other", "hi")["provider"] == "none"


def test_template_messages_and_alert_message_endpoint(api):
    client, _ = api
    assert "Syabrubesi" in template_message("watch", "ne", "Syabrubesi")["text"]
    from .conftest import impulse
    client.post("/api/ingest", json={"node_id": "BD-001", "sensor_window": impulse()})
    alert = client.get("/api/alerts").json()[0]
    msg = client.get(f"/api/alerts/{alert['id']}/message", params={"lang": "ne"}).json()
    assert msg["provider"] == "static-template" and msg["lang"] == "ne" and msg["reviewed"] is False
    assert client.get("/api/ingestion-log").json()[0]["outcome"] == "accepted"
    assert len(ambient()) == 160
