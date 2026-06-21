-------------------------------------------------------------------------------
-- WEB-44: Night actions + night processing
--
-- - One role action per actor per phase (so submissions can be updated before
--   the phase ends via upsert).
-- - Actors may update their own pending action; the host may resolve actions
--   (write detective results, mark resolved) during night processing.
-- - The host may create per-player notifications for their game (kills,
--   investigation results, saves) during night processing.
-------------------------------------------------------------------------------

-- One action per actor per phase (enables update-before-deadline via upsert).
do $$ begin
  alter table public.role_actions
    add constraint role_actions_phase_actor_key unique (phase_id, actor_id);
exception when duplicate_table or duplicate_object then null; end $$;

-- Actors can update their own (unresolved) action while a phase is open.
drop policy if exists "Players update their own role actions" on public.role_actions;
create policy "Players update their own role actions"
  on public.role_actions for update to authenticated
  using (
    not resolved
    and exists (
      select 1 from public.game_players gp
      where gp.id = role_actions.actor_id
        and gp.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = role_actions.actor_id
        and gp.user_id = (select auth.uid())
        and gp.game_id = role_actions.game_id
    )
  );

-- Host can resolve actions during night processing (write results / mark resolved).
drop policy if exists "Hosts can resolve role actions" on public.role_actions;
create policy "Hosts can resolve role actions"
  on public.role_actions for update to authenticated
  using (private.is_game_host(game_id))
  with check (private.is_game_host(game_id));

-- Host can create notifications for players in their game (night outcomes).
drop policy if exists "Hosts can insert game notifications" on public.notifications;
create policy "Hosts can insert game notifications"
  on public.notifications for insert to authenticated
  with check (game_id is not null and private.is_game_host(game_id));
