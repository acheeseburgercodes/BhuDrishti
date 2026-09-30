# API contract (v0.2)

Interactive schema: `http://localhost:8000/docs`. 🔒 = operator (`X-Operator-Token`, or loopback when no token is configured).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | `mode` (`demo`/`live`), persistence status |
| GET | `/api/config` | Public config only: mode, Realtime anon settings, language capabilities, provider catalogue |
| GET | `/api/nodes`, `/api/devices` | Registry (devices from Supabase when configured) |
| GET | `/api/settlements`, `/api/coverage-gaps` | Seed context |
| GET | `/api/coverage?max_age_minutes=60&as_of=ISO` | GeoJSON grid + summary + method |
| GET | `/api/events?limit=30` | Newest first (Supabase when configured, memory fallback) |
| POST | `/api/ingest` | One reading (below). Optional `X-Device-Key`. 404 unknown ESP32 node, 422 invalid, 429 rate limited |
| POST | `/api/ingest/batch` | `{readings: [...≤50]}` → `{results: [{client_event_id, status: accepted|duplicate|rejected}]}` |
| GET | `/api/alerts?status=` | Drafted alerts |
| POST 🔒 | `/api/alerts/{id}/approve` · `/reject` | `{note, operator}`; audited; approval records notification text |
| GET | `/api/alerts/{id}/message?lang=ne` | Static template text in en/ne/hi |
| GET | `/api/ingestion-log`, 🔒 `/api/audit` | Accepted/duplicate/rejected log; audit trail |
| GET | `/api/agents/providers`, `/api/agents/runs` | Provider health; recent runs |
| POST 🔒 | `/api/agents/run` | `{agents?: [...], event_id?, language}` |
| GET | `/api/i18n/languages` | Translate/TTS/STT capability per language |
| POST 🔒 | `/api/translate`, `/api/tts` | Sarvam-backed; falls back to source text / no audio |
| POST | `/api/simulate-event` | Demo only; result is labelled `demo: true`, `channel: simulator` |
| POST | `/api/classify` | Raw window → features + label |
| WS | `/ws/live` | `snapshot`, `telemetry`, `alert`, `agent_run`; send `ping` → `pong` |

## Ingest payload

Required: `node_id`, `sensor_window` (8–2048 numbers). Everything else optional:

```json
{
  "node_id": "BD-002", "sensor_window": [0.01, -0.02, 0.4, "..."],
  "source": "phone_layer", "channel": "mobile_app", "transport": "wifi_softap",
  "device_id": "ph-lx2k-a1b2c3", "client_event_id": "m-lx2k9f-0k3j2a",
  "captured_at": "2026-09-30T06:00:00Z", "queued": true, "queued_at": "2026-09-30T06:00:05Z", "attempt": 2,
  "sample_rate_hz": 100, "battery_pct": 81, "lat": 28.16, "lng": 85.34,
  "demo": false, "synthetic_window": false
}
```

Response = the event: original keys (`id, node_id, node_name, lat, lng, recorded_at,
telemetry, classification, source, confirmation`) plus `channel, transport, device_id,
queued, attempt, quality{score,flags}, cross_confirmation{cross_confirmed,sources,window_s,matched_event_ids},
alert_confidence, alert_id?, demo, synthetic_window, persistence, duplicate?`.
