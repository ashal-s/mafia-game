-------------------------------------------------------------------------------
-- Allow interrupted phase claims to be recovered by a later scheduler tick.
-------------------------------------------------------------------------------

alter table public.game_phases
  add column if not exists processing_started_at timestamptz;

comment on column public.game_phases.processing_started_at is
  'When resolution was claimed; processing claims older than five minutes may be reclaimed.';

-- A claimed phase may coexist briefly with the successor that has just been
-- inserted. The compare-and-set claim still prevents concurrent resolution,
-- while this index prevents two active successors.
drop index if exists public.game_phases_one_open_per_game_idx;
create unique index game_phases_one_active_per_game_idx
  on public.game_phases (game_id)
  where status = 'active';
