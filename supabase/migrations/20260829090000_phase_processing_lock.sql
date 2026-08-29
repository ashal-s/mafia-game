-------------------------------------------------------------------------------
-- WEB-57: safely claim an expired phase before the scheduler resolves it.
-------------------------------------------------------------------------------

alter type public.game_phase_status add value if not exists 'processing';
