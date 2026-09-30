# Implementation plan (2026-09-30 run)

## Audit findings

- FastAPI backend (`backend/main.py`) with in-memory event buffer, logistic-regression
  classifier, optional Supabase REST persistence for a single `events` table, WS stream.
- React/Vite dashboard (`frontend/src/App.jsx`) with Leaflet map, hard-coded "tactical" copy
  (static clock, "DEFCON 2", "WS: 12ms SYNC") that implied live facts it did not measure.
- Expo mobile app: single screen, capture + POST, no offline queue, no navigation.
- ESP32 bridge script polls `GET 192.168.4.1/events` and posts to `/api/ingest`.
- Hygiene issues: `backend/.venv` (≈700 files) was tracked in git; `.env.example`
  contained a real-looking Supabase service-role JWT. Both fixed in the first commit.
  **The key is still in git history and must be rotated in the Supabase dashboard.**
- No tests, no lint config, no migrations.

## Slices (each committed locally when green)

1. Data/schema/contracts: `shared/` JS contracts + queue, backend `contracts.py`,
   `ingestion.py` (validation, idempotency, rate limit, cross-confirmation),
   `coverage.py`, multi-table `storage.py`, Supabase migrations + seed, pytest suite.
2. Web shell: Tailwind v4, restrained layout, honest status bar, realtime via backend WS
   or Supabase Realtime, events/devices/alerts panels. Legacy UI kept at `#legacy`.
3. Map: MapLibre GL + OpenFreeMap/OSM tiles, nodes, events, coverage grid layer, legend,
   freshness slider, list alternative, offline fallback style.
4. Mobile: tabbed companion app with capture, offline queue/retry, alerts, WebView map,
   language picker, permission/error states.
5. Agents + Sarvam: bounded sub-agents, provider adapters (GrokBot, Groq, OpenRouter,
   Gemini, HF, Ollama, rules, mock), approvals; server-side Sarvam adapter with cache.
6. Docs + verification: architecture, API, providers, provenance, run steps; full test/build.
