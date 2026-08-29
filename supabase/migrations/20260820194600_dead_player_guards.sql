-------------------------------------------------------------------------------
-- WEB-60: enforce dead-player action and voting restrictions at the database
-- boundary as well as in server actions. This prevents a client from bypassing
-- the application UI and writing directly through the Supabase API.
-------------------------------------------------------------------------------

drop policy if exists "Players insert their own role actions" on public.role_actions;
create policy "Living players insert their own role actions"
  on public.role_actions for insert to authenticated
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = role_actions.actor_id
        and gp.user_id = (select auth.uid())
        and gp.game_id = role_actions.game_id
        and gp.status = 'alive'
    )
  );

drop policy if exists "Players update their own role actions" on public.role_actions;
create policy "Living players update their own role actions"
  on public.role_actions for update to authenticated
  using (
    not resolved
    and exists (
      select 1 from public.game_players gp
      where gp.id = role_actions.actor_id
        and gp.user_id = (select auth.uid())
        and gp.status = 'alive'
    )
  )
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = role_actions.actor_id
        and gp.user_id = (select auth.uid())
        and gp.game_id = role_actions.game_id
        and gp.status = 'alive'
    )
  );

drop policy if exists "Players cast their own vote" on public.votes;
create policy "Living players cast their own vote"
  on public.votes for insert to authenticated
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = votes.voter_id
        and gp.user_id = (select auth.uid())
        and gp.game_id = votes.game_id
        and gp.status = 'alive'
    )
  );

drop policy if exists "Players update their own vote" on public.votes;
create policy "Living players update their own vote"
  on public.votes for update to authenticated
  using (
    exists (
      select 1 from public.game_players gp
      where gp.id = votes.voter_id
        and gp.user_id = (select auth.uid())
        and gp.status = 'alive'
    )
  )
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = votes.voter_id
        and gp.user_id = (select auth.uid())
        and gp.game_id = votes.game_id
        and gp.status = 'alive'
    )
  );
