-------------------------------------------------------------------------------
-- WEB-125: Phase auto-advance via Supabase pg_cron + pg_net (replaces Vercel Cron)
--
-- Schedules a POST every minute to the Next.js route /api/cron/advance-phases.
-- The URL and bearer token live in Supabase Vault — run this once per project
-- (SQL Editor) after deploy:
--
--   select vault.create_secret(
--     'https://YOUR-APP.vercel.app/api/cron/advance-phases',
--     'advance_phases_url',
--     'Phase auto-advance endpoint'
--   );
--   select vault.create_secret(
--     'YOUR_CRON_SECRET',
--     'cron_secret',
--     'Must match CRON_SECRET in Vercel'
--   );
--
-- If a secret already exists, update it via Dashboard → Database → Vault.
-------------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.invoke_advance_phases_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _url text;
  _secret text;
begin
  select decrypted_secret into _url
  from vault.decrypted_secrets
  where name = 'advance_phases_url'
  limit 1;

  select decrypted_secret into _secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  limit 1;

  if _url is null or _secret is null then
    raise warning 'advance_phases cron skipped: set vault secrets advance_phases_url and cron_secret';
    return;
  end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function private.invoke_advance_phases_cron() from public, anon, authenticated;

-- Idempotent reschedule.
do $do$
declare
  _jobid bigint;
begin
  select jobid into _jobid from cron.job where jobname = 'advance-expired-phases';
  if _jobid is not null then
    perform cron.unschedule(_jobid);
  end if;
end $do$;

select cron.schedule(
  'advance-expired-phases',
  '* * * * *',
  $$select private.invoke_advance_phases_cron();$$
);
