-- WEB-41 fix: restore EXECUTE on the RLS membership helpers.
--
-- The WEB-55 migration revoked EXECUTE on private.is_game_member /
-- private.is_game_host from `authenticated`. But these functions are called
-- from within the RLS policies on games/game_players/etc., which are evaluated
-- as the `authenticated` role. Without EXECUTE (and USAGE on the private
-- schema) every such policy fails with "permission denied for function
-- is_game_member" — e.g. when selecting a game right after creating it.
--
-- Granting EXECUTE here is safe: the `private` schema is not exposed through
-- the Supabase Data API, so these helpers are not callable as RPC. That schema
-- isolation (not the revoke) is what keeps them off the public API surface.

grant usage on schema private to authenticated;
grant execute on function private.is_game_member(uuid) to authenticated;
grant execute on function private.is_game_host(uuid) to authenticated;
