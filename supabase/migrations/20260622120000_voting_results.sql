-------------------------------------------------------------------------------
-- WEB-45: Voting, results, and win conditions
--
-- The `votes` table, its RLS policies (members read; voter casts/updates own),
-- the `(phase_id, voter_id)` uniqueness constraint, and `games.winner_alignment`
-- already exist from the MVP schema (WEB-55). The only thing missing for the
-- day-voting loop is realtime: clients need to see the live tally update as
-- players cast and change their votes during the voting phase.
--
-- Day votes are public information in Mafia, so broadcasting voter_id/target_id
-- (which are game_players ids, not user ids) does not leak any secret role data.
-------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'votes'
  ) then
    alter publication supabase_realtime add table public.votes;
  end if;
end $$;
