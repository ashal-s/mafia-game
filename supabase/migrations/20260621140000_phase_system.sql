-- WEB-43: Phase system — night → discussion → voting → results → night.
--
-- * Extend the phase-type enum with the day/night sub-phases the game cycles
--   through (the legacy 'day' value is kept for backwards compatibility).
-- * Track a scheduled end time per phase (`ends_at`) to drive the countdown
--   timer, distinct from `ended_at` (when the phase actually closed).
-- * Track the game's current phase via `games.current_phase_id`.
-- * Publish `game_phases` over Realtime so the phase/timer updates live.
--
-- RLS is unchanged: members read phases/events, the host manages phases, games,
-- and inserts game events (covered by the WEB-55 policies).

-------------------------------------------------------------------------------
-- Phase-type enum values
-------------------------------------------------------------------------------
alter type public.game_phase_type add value if not exists 'discussion';
alter type public.game_phase_type add value if not exists 'voting';
alter type public.game_phase_type add value if not exists 'results';

-------------------------------------------------------------------------------
-- game_phases: scheduled end time (timer deadline)
-------------------------------------------------------------------------------
alter table public.game_phases
  add column if not exists ends_at timestamptz;

comment on column public.game_phases.ends_at is
  'Scheduled end of the phase (drives the countdown timer). ended_at records when it actually closed.';

-------------------------------------------------------------------------------
-- games: pointer to the active phase
-------------------------------------------------------------------------------
alter table public.games
  add column if not exists current_phase_id uuid
    references public.game_phases (id) on delete set null;

comment on column public.games.current_phase_id is
  'The currently active phase for this game.';

-------------------------------------------------------------------------------
-- Realtime: stream phase changes to connected clients
-------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_phases'
  ) then
    alter publication supabase_realtime add table public.game_phases;
  end if;
end $$;
