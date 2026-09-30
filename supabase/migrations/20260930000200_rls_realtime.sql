-- Row-level security + Realtime. Idempotent.
-- Principle: anon/authenticated clients may READ operational status that is shown on the
-- public dashboard; they may never write. All writes go through the FastAPI backend with
-- the service-role key, which bypasses RLS and must stay server-side.

alter table public.events enable row level security;
alter table public.devices enable row level security;
alter table public.ingestion_logs enable row level security;
alter table public.alerts enable row level security;
alter table public.model_decisions enable row level security;
alter table public.coverage_samples enable row level security;
alter table public.audit_events enable row level security;
alter table public.notifications enable row level security;
alter table public.translations enable row level security;
alter table public.agent_runs enable row level security;

-- Public read of recent events (last 7 days) — no raw client identifiers are selected by the UI.
drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events for select to anon, authenticated
  using (recorded_at > now() - interval '7 days');

drop policy if exists devices_public_read on public.devices;
create policy devices_public_read on public.devices for select to anon, authenticated using (true);

drop policy if exists alerts_public_read on public.alerts;
create policy alerts_public_read on public.alerts for select to anon, authenticated
  using (updated_at > now() - interval '7 days');

drop policy if exists coverage_public_read on public.coverage_samples;
create policy coverage_public_read on public.coverage_samples for select to anon, authenticated
  using (as_of > now() - interval '2 days');

drop policy if exists notifications_public_read on public.notifications;
create policy notifications_public_read on public.notifications for select to anon, authenticated
  using (status in ('approved', 'sent'));

-- ingestion_logs, model_decisions, audit_events, translations, agent_runs: no anon/auth
-- policies => denied for clients; readable only by the service role (backend/operators).

-- Defence in depth: remove table privileges from client roles for internal tables, and
-- make every client-readable table read-only at the privilege level too.
revoke all on public.ingestion_logs, public.model_decisions, public.audit_events, public.translations, public.agent_runs
  from anon, authenticated;
revoke insert, update, delete, truncate on public.events, public.devices, public.alerts, public.coverage_samples, public.notifications
  from anon, authenticated;

-- Realtime: publish status tables the dashboard subscribes to.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['events', 'devices', 'alerts'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── Retention (run nightly via pg_cron or a scheduled Edge Function) ──
-- Suggested defaults for a prototype; tune to your data-governance policy:
--   events: 180 days (keep event-class rows 2 years), ingestion_logs: 30 days,
--   model_decisions: 180 days, coverage_samples: 90 days, agent_runs: 90 days,
--   audit_events: 2 years (never shorter than legal requirements), translations: until invalidated.
create or replace function public.bhudrishti_apply_retention() returns void language sql security definer set search_path = public as $$
  delete from public.ingestion_logs where received_at < now() - interval '30 days';
  delete from public.events where recorded_at < now() - interval '180 days' and classification = 'normal';
  delete from public.events where recorded_at < now() - interval '2 years';
  delete from public.model_decisions where created_at < now() - interval '180 days';
  delete from public.coverage_samples where created_at < now() - interval '90 days';
  delete from public.agent_runs where created_at < now() - interval '90 days';
$$;
revoke all on function public.bhudrishti_apply_retention() from public, anon, authenticated;
