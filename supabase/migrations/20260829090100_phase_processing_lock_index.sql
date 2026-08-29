-------------------------------------------------------------------------------
-- The enum value is committed by the preceding migration before it is used.
-------------------------------------------------------------------------------

-- Only one phase in a game may be open or undergoing resolution. This backs up
-- the application's compare-and-set lock and protects manual/cron overlap.
create unique index if not exists game_phases_one_open_per_game_idx
  on public.game_phases (game_id)
  where status in ('active', 'processing');

comment on index public.game_phases_one_open_per_game_idx is
  'Prevents concurrent schedulers or host actions from opening two phases.';

-- WEB-57 uses Vercel Cron. Remove the legacy Supabase pg_cron invocation so a
-- deployed project has one scheduler source (the phase claim still protects
-- against Vercel retries and overlapping host actions).
do $do$
declare
  _jobid bigint;
begin
  select jobid into _jobid
  from cron.job
  where jobname = 'advance-expired-phases';

  if _jobid is not null then
    perform cron.unschedule(_jobid);
  end if;
end $do$;
