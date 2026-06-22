-------------------------------------------------------------------------------
-- WEB-45: Reveal all roles when the game is over
--
-- During play, roles stay secret: a player sees only their own role (plus mafia
-- teammates), and the host sees everything. Once the game is `completed`, the
-- final reveal should show every role to every player in the game, so we widen
-- the SELECT policy to also allow any game member to read all roles for a
-- finished game.
-------------------------------------------------------------------------------

drop policy if exists "Players see their own role, mafia teammates, host sees all"
  on public.game_player_roles;

create policy "Players see their own role, mafia teammates, host sees all"
  on public.game_player_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_game_host(game_id)
    or (alignment = 'mafia' and private.is_mafia(game_id))
    or (
      private.is_game_member(game_id)
      and exists (
        select 1
        from public.games g
        where g.id = game_player_roles.game_id
          and g.status = 'completed'
      )
    )
  );
