# Supabase setup

1. Create a project. In the SQL editor (or `supabase db push`) run, in order:
   `supabase/migrations/20260930000100_core_schema.sql`, then `..._rls_realtime.sql`.
   Both are idempotent and extend the legacy `events` table from `supabase/events.sql`.
2. Optional demo rows: `supabase/seed.sql` (every row `is_demo = true`).
3. Backend `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Browser Realtime (optional):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — or set them on the backend and it will publish
   them via `/api/config`.

| Table | Purpose | Client (anon) access |
| --- | --- | --- |
| `events` | telemetry decisions + provenance | read, last 7 days |
| `devices` | node / phone registry | read |
| `alerts` | drafted/approved alerts | read, last 7 days |
| `coverage_samples` | coverage summaries | read, last 2 days |
| `notifications` | approved message text | read approved/sent only |
| `ingestion_logs`, `model_decisions`, `audit_events`, `translations`, `agent_runs` | internal | none (privileges revoked) |

All writes go through the backend with the service-role key; client roles have insert /
update / delete revoked. Realtime publishes `events`, `devices`, `alerts` (RLS applies).

Retention: `public.bhudrishti_apply_retention()` implements suggested defaults (ingestion
logs 30 d, normal events 180 d, all events 2 y, model decisions 180 d, coverage/agent runs
90 d). Schedule it with `pg_cron` or an Edge Function; audit events are kept ≥ 2 y.

**Key hygiene:** a service-role JWT was previously committed in `.env.example` (removed
2026-09-30, still in git history). Rotate that project's keys before any deployment.
