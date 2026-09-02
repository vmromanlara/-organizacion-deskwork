-- =====================================================================
-- TKT-026 — PHASE 2D — OUTBOX PG_CRON SCHEDULING
-- =====================================================================
-- Per design: DESKWORK_TICKETING_CORE_TKT_026_PHASE_2_DISCOVERY_DESIGN.md
--   §9.3  pg_cron migration
--   §12   pg_cron design (frequency, invocation, overlap)
--   §16.3 pg_cron secret + authorization
--
-- Purpose:
--   Schedule the periodic invocation of the `notify-worker` Edge Function
--   from the database, using pg_cron (schedule) + pg_net (HTTP from SQL).
--
-- Pre-requisites (MUST be set BEFORE this migration is applied):
--
--   alter database postgres set app.outbox_worker_url  = '<edge function url>';
--   alter database postgres set app.outbox_cron_secret = '<32-byte hex secret>';
--
-- These GUCs are read at execution time via current_setting(); the secret
-- is NEVER hardcoded in this migration. The command stored in cron.job
-- references the GUCs by name, so rotating the secret does not require a
-- migration change.
--
-- Idempotency:
--   - create extension if not exists pg_cron   (idempotent)
--   - create extension if not exists pg_net    (idempotent)
--   - cron.schedule(name, schedule, cmd)       (idempotent — Supabase pg_cron
--                                                updates the existing job in
--                                                place when name matches; the
--                                                same jobid is returned)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 2. Pre-flight: GUCs must be configured in the environment
-- ---------------------------------------------------------------------
-- Per design §12.4 / R-P1: refuse to install the job if the GUCs are
-- missing. This catches misconfiguration early, at migration time,
-- instead of silently leaving a broken cron job.
do $$
begin
  if coalesce(current_setting('app.outbox_worker_url', true), '') = '' then
    raise exception
      'app.outbox_worker_url is not configured. Run before re-applying: '
      'alter database postgres set app.outbox_worker_url = ''<edge function url>'';';
  end if;

  if coalesce(current_setting('app.outbox_cron_secret', true), '') = '' then
    raise exception
      'app.outbox_cron_secret is not configured. Run before re-applying: '
      'alter database postgres set app.outbox_cron_secret = ''<32-byte hex secret>'';';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 3. Schedule the worker
-- ---------------------------------------------------------------------
-- Cron expression '* * * * *' = every minute (per design §12.1).
-- Job name 'outbox-worker' = the canonical job identifier (per design).
--
-- The command is stored verbatim in cron.job and executed by pg_cron at
-- each tick. It uses current_setting() to read the GUCs at execution
-- time, so:
--   - The secret is never stored in the migration or in cron.job.
--   - Rotating the secret is a one-line `alter database ... set ...`.
--   - The GUCs are DB-internal; only roles with `pg_db_role_setting`
--     read access can see them (postgres, supabase_admin).
--
-- net.http_post is asynchronous: it returns the request_id immediately
-- and the HTTP call happens in the background. The cron tick is not
-- blocked waiting for the Edge Function.
-- ---------------------------------------------------------------------
select cron.schedule(
  'outbox-worker',
  '* * * * *',
  $cmd$select net.http_post(
    url := current_setting('app.outbox_worker_url', true),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.outbox_cron_secret', true)
    ),
    body := '{}'::jsonb
  )$cmd$
);
