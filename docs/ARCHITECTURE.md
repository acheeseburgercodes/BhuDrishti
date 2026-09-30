# Architecture

```
ESP32 node ──BLE/WiFi──► ESP32 bridge (SoftAP 192.168.4.1, GET /events)
                              │  scripts/esp32_bridge.py polls, POST /api/ingest
Phone (Expo app) ─┐           ▼
Browser portal  ──┴──► FastAPI backend ──► Supabase (service role, server-side only)
                        │  validate → idempotency → classify → quality → cross-confirm
                        │  → alert draft (pending_approval) → persist → broadcast
                        ├─ WS /ws/live ─────────────► web dashboard, (mobile polls REST)
                        ├─ agents/ (rules + optional LLM providers)
                        └─ sarvam.py (translation; key server-side)
Supabase Realtime (anon key, RLS read-only) ─────────► web dashboard (optional)
```

## Ingestion pipeline (`backend/ingestion.py`)

1. **Validation** (`contracts.py`, mirrored in `shared/src/contracts.js`): id patterns,
   8–2048 finite samples within ±1000, timestamps not >5 min in the future, enum-checked
   `source` (`esp32_node` | `phone_layer`), `channel` (bridge / mobile app / web portal /
   simulator) and `transport`.
2. **Access**: optional `X-Device-Key`; per-client token-bucket rate limit (429 + Retry-After).
3. **Idempotency**: `client_event_id` de-duplicates retries from offline queues (memory LRU
   + unique index in Supabase). `/api/ingest/batch` returns per-item results.
4. **Classification** + **signal quality** flags (flatline, clipping, short window, low
   sample rate, aliasing) that can only lower confidence.
5. **Cross-confirmation**: both sources flag `event` at the same node within ±30 s.
6. **Alert confidence** = model confidence × quality (+0.15 if cross-confirmed).
   Level: `advisory` (single source) or `watch` (cross-confirmed, ≥0.7). `warning` is never
   set automatically. Every alert starts `pending_approval`; approval is operator-only and audited.
7. **Persistence**: best-effort; failures go to a bounded outbox retried on the next write,
   and responses report `persistence: supabase | degraded | memory`.
8. Late (queued) readings never move a node's `last_seen` backwards.

The legacy contract is preserved: the bridge's `{node_id, sensor_window, source, battery_pct}`
payload is accepted unchanged and the response keeps all original keys.

## Clients

* **Web** (`frontend/src`): `useLiveData` bootstraps over REST, streams over WebSocket with
  capped backoff, falls back to polling, then to a bundled fixture. Optional Supabase
  Realtime subscription when the API publishes public settings. Coverage is recomputed in
  the browser with the shared model (parity-tested against Python) so the freshness slider
  is instant and works offline.
* **Mobile** (`mobile/`): AsyncStorage-backed `OfflineQueue` (shared), NetInfo-triggered
  flush, exponential backoff with jitter, permanent-error drop for 4xx, cached last data.
  Map is MapLibre GL in a WebView (Expo Go compatible) with a list fallback.

## Agents (`backend/agents/`)

Five named sub-agents — incident triage, sensor quality, coverage gap, notification
draft, operator recommendation. Each always computes a deterministic rules baseline; if a
provider is configured the router (ordered, health-aware, rate-limit cooldowns, circuit
breaker) may return a JSON refinement that is validated and merged. LLMs cannot downgrade
rule findings, cannot draft a notification when rules found no alert, and never publish.
First-stage agents run concurrently (semaphore 3) with per-agent timeouts. Every output
records provider, model, attempts, latency and confidence; runs are stored in `agent_runs`.

## Security notes

* Privileged endpoints: `X-Operator-Token` (constant-time compare) or loopback-only when
  no token is configured.
* Free text is sanitised before logs/prompts; prompts wrap data in `<data>` and instruct
  the model to treat it as untrusted.
* CORS defaults to `*` for local demos; set `BHUDRISHTI_CORS_ORIGINS` in deployment.
* Rate limiting is in-process; enforce it at the proxy too when running multiple workers.
