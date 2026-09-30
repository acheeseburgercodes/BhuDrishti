from datetime import datetime, timedelta, timezone

from backend.ingestion import alert_confidence, alert_level, cross_confirmation, sanitize_text, sensor_quality
from backend.rate_limit import TokenBucketLimiter

from .conftest import ambient, impulse


def test_legacy_bridge_payload_still_accepted(api):
    client, _ = api
    r = client.post("/api/ingest", json={"node_id": "BD-001", "sensor_window": ambient(), "source": "esp32_node", "battery_pct": 80})
    assert r.status_code == 200
    body = r.json()
    for key in ("id", "node_id", "node_name", "lat", "lng", "recorded_at", "telemetry", "classification", "source", "confirmation"):
        assert key in body
    assert body["classification"]["classification"] == "normal"
    assert body["channel"] == "unknown" and body["persistence"] == "memory"


def test_validation_rejects_bad_payloads(api):
    client, _ = api
    assert client.post("/api/ingest", json={"node_id": "BD-001", "sensor_window": [0.1] * 4}).status_code == 422
    assert client.post("/api/ingest", json={"node_id": "BD-001", "sensor_window": [5000.0] * 20}).status_code == 422
    assert client.post("/api/ingest", json={"node_id": "bad id!", "sensor_window": ambient()}).status_code == 422
    assert client.post("/api/ingest", json={"node_id": "BD-001", "sensor_window": ambient(), "source": "drone"}).status_code == 422
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    assert client.post("/api/ingest", json={"node_id": "BD-001", "sensor_window": ambient(), "recorded_at": future}).status_code == 422
    assert client.post("/api/ingest", json={"node_id": "BD-001", "sensor_window": [0.0] * 3000}).status_code == 422


def test_unknown_esp32_node_is_rejected_but_phone_registers(api):
    client, main = api
    assert client.post("/api/ingest", json={"node_id": "BD-999", "sensor_window": ambient()}).status_code == 404
    assert main.service.ingestion_log[0]["outcome"] == "rejected"
    r = client.post("/api/ingest", json={"node_id": "PH-test-1", "sensor_window": ambient(), "source": "phone_layer", "channel": "mobile_app",
                                         "device_id": "dev-abc", "lat": 28.1, "lng": 85.3})
    assert r.status_code == 200
    node = main.service.find_node("PH-test-1")
    assert node["kind"] == "phone" and node["location_estimated"] is False and node["device_id"] == "dev-abc"
    main.nodes.remove(node)


def test_source_differentiation_and_cross_confirmation(api):
    client, _ = api
    first = client.post("/api/ingest", json={"node_id": "BD-002", "sensor_window": impulse(), "source": "esp32_node", "channel": "esp32_bridge", "transport": "wifi_softap"}).json()
    assert first["classification"]["classification"] == "event"
    assert first["cross_confirmation"]["cross_confirmed"] is False
    assert first["source"] == "esp32_node" and first["channel"] == "esp32_bridge" and first["transport"] == "wifi_softap"
    same = client.post("/api/ingest", json={"node_id": "BD-002", "sensor_window": impulse(), "source": "esp32_node"}).json()
    assert same["cross_confirmation"]["cross_confirmed"] is False
    second = client.post("/api/ingest", json={"node_id": "BD-002", "sensor_window": impulse(), "source": "phone_layer", "channel": "mobile_app"}).json()
    assert second["cross_confirmation"]["cross_confirmed"] is True
    assert second["confirmation"] == "cross-confirmed"
    assert first["id"] in second["cross_confirmation"]["matched_event_ids"]
    alerts = client.get("/api/alerts").json()
    assert len(alerts) == 1 and alerts[0]["level"] == "watch" and alerts[0]["status"] == "pending_approval"
    assert set(alerts[0]["sources"]) == {"esp32_node", "phone_layer"}


def test_idempotent_retry_and_batch(api):
    client, main = api
    payload = {"node_id": "BD-001", "sensor_window": ambient(), "client_event_id": "c-retry-1", "queued": True, "channel": "mobile_app", "source": "phone_layer"}
    a = client.post("/api/ingest", json=payload).json()
    b = client.post("/api/ingest", json={**payload, "attempt": 2}).json()
    assert a["id"] == b["id"] and b["duplicate"] is True
    assert len([e for e in main.service.events if e["client_event_id"] == "c-retry-1"]) == 1
    batch = client.post("/api/ingest/batch", json={"readings": [
        {**payload, "client_event_id": "c-batch-1"}, payload, {"node_id": "BD-404", "sensor_window": ambient(), "client_event_id": "c-batch-3"}]}).json()
    assert [r["status"] for r in batch["results"]] == ["accepted", "duplicate", "rejected"]


def test_rate_limit_and_device_key(api, monkeypatch):
    client, main = api
    monkeypatch.setattr(main, "limiter", TokenBucketLimiter(60, burst=2))
    body = {"node_id": "BD-001", "sensor_window": ambient()}
    codes = [client.post("/api/ingest", json=body).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    monkeypatch.setattr(main, "limiter", TokenBucketLimiter(10000, burst=10000))
    monkeypatch.setattr(main.settings, "device_key", "k-123")
    assert client.post("/api/ingest", json=body).status_code == 401
    assert client.post("/api/ingest", json=body, headers={"X-Device-Key": "k-123"}).status_code == 200


def test_operator_token_protects_alert_approval(api, monkeypatch):
    client, main = api
    client.post("/api/ingest", json={"node_id": "BD-004", "sensor_window": impulse()})
    alert_id = client.get("/api/alerts").json()[0]["id"]
    monkeypatch.setattr(main.settings, "operator_token", "secret-op")
    assert client.post(f"/api/alerts/{alert_id}/approve", json={}).status_code == 401
    r = client.post(f"/api/alerts/{alert_id}/approve", json={"note": "checked by phone"}, headers={"X-Operator-Token": "secret-op"})
    assert r.status_code == 200 and r.json()["status"] == "approved"
    assert main.service.audit[0]["action"] == "alert.approve"


def test_late_queued_reading_does_not_rewind_node_freshness(api):
    client, main = api
    fresh = datetime.now(timezone.utc).isoformat()
    old = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    client.post("/api/ingest", json={"node_id": "BD-006", "sensor_window": ambient(), "recorded_at": fresh})
    client.post("/api/ingest", json={"node_id": "BD-006", "sensor_window": ambient(), "recorded_at": old, "queued": True, "client_event_id": "c-late"})
    assert main.service.find_node("BD-006")["last_seen"] == datetime.fromisoformat(fresh).isoformat()


def test_simulated_events_are_labelled_demo(api):
    client, _ = api
    body = client.post("/api/simulate-event", json={"node_id": "BD-002", "severity": "normal"}).json()
    assert body["demo"] is True and body["channel"] == "simulator"


def test_pure_helpers():
    now = datetime.now(timezone.utc)
    prior = [{"id": "e1", "node_id": "N1", "source": "phone_layer", "recorded_at": (now - timedelta(seconds=10)).isoformat(),
              "classification": {"classification": "event"}},
             {"id": "e2", "node_id": "N1", "source": "phone_layer", "recorded_at": (now - timedelta(seconds=90)).isoformat(),
              "classification": {"classification": "event"}}]
    assert cross_confirmation(prior, "N1", "esp32_node", True, now)["matched_event_ids"] == ["e1"]
    assert cross_confirmation(prior[1:], "N1", "esp32_node", True, now)["cross_confirmed"] is False
    assert cross_confirmation(prior, "N1", "esp32_node", False, now)["cross_confirmed"] is False
    assert alert_confidence(0.9, True, False, 0.5) == 0.45
    assert alert_confidence(0.9, False, True, 1.0) == 0.0
    assert alert_level(True, True, 0.8) == "watch" and alert_level(True, False, 0.99) == "advisory" and alert_level(False, True, 1) is None
    q = sensor_quality([0.0] * 40, {"dominant_frequency_hz": 0}, 100)
    assert "flatline" in q["flags"] and "short_window" in q["flags"] and q["score"] < 0.5
    assert sanitize_text("<script>alert(1)</script>") == "scriptalert(1)/script"
