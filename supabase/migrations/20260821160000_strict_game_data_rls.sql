-- WEB-63: make hidden game data private by default.
--
-- These policies deliberately use SECURITY DEFINER predicates from the private
-- schema.  Besides avoiding recursive RLS evaluation, that keeps every policy
-- tied to auth.uid() rather than to user-controlled row values.

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------

create or replace function private.is_own_player(_player_id uuid, _game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_players gp
    where gp.id = _player_id
      and gp.game_id = _game_id
      and gp.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_own_player(uuid, uuid) from public, anon;
grant execute on function private.is_own_player(uuid, uuid) to authenticated;

-- The old role_id column predates game_player_roles.  Leaving it on the roster
-- would expose a second, unprotected place for secret assignments to be stored.
drop index if exists public.game_players_role_id_idx;
alter table public.game_players drop column if exists role_id;

-------------------------------------------------------------------------------
-- Profiles: private account data is owner-only.
-------------------------------------------------------------------------------

alter table public.profiles enable row level security;
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-------------------------------------------------------------------------------
-- Games: no unaffiliated lobby discovery through the base table.
-------------------------------------------------------------------------------

alter table public.games enable row level security;
drop policy if exists "Games are visible to members, host, or while joinable" on public.games;
create policy "Members and hosts can read games"
  on public.games for select to authenticated
  using (private.is_game_member(id) or private.is_game_host(id));

-------------------------------------------------------------------------------
-- Players: members may see the roster, but only a host may mutate player state.
-- A joining user can create only a clean row for themself.
-------------------------------------------------------------------------------

alter table public.game_players enable row level security;
drop policy if exists "Users can add themselves to a game" on public.game_players;
drop policy if exists "Players or host can update player rows" on public.game_players;
drop policy if exists "Players can leave or host can remove players" on public.game_players;

create policy "Users can join as themselves"
  on public.game_players for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and is_host = false
    and status = 'alive'
    and is_muted = false
  );

create policy "Hosts can add players"
  on public.game_players for insert to authenticated
  with check (private.is_game_host(game_id));

create policy "Hosts can update players"
  on public.game_players for update to authenticated
  using (private.is_game_host(game_id))
  with check (private.is_game_host(game_id));

create policy "Players can leave and hosts can remove players"
  on public.game_players for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_game_host(game_id));

-------------------------------------------------------------------------------
-- Roles and private actions.
-------------------------------------------------------------------------------

alter table public.game_player_roles enable row level security;
alter table public.role_actions enable row level security;

drop policy if exists "Actor or host can read role actions" on public.role_actions;
create policy "Actors and hosts can read role actions"
  on public.role_actions for select to authenticated
  using (
    private.is_game_host(game_id)
    or private.is_own_player(actor_id, game_id)
  );

drop policy if exists "Players insert their own role actions" on public.role_actions;
create policy "Players insert their own unresolved actions"
  on public.role_actions for insert to authenticated
  with check (
    private.is_own_player(actor_id, game_id)
    and result is null
    and resolved = false
    and exists (
      select 1
      from public.game_phases phase
      where phase.id = role_actions.phase_id
        and phase.game_id = role_actions.game_id
    )
    and (
      target_id is null
      or exists (
        select 1
        from public.game_players target
        where target.id = role_actions.target_id
          and target.game_id = role_actions.game_id
      )
    )
  );

-------------------------------------------------------------------------------
-- Votes, chat, notifications, and event history.
-------------------------------------------------------------------------------

alter table public.votes enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.game_events enable row level security;

-- A host need not also occupy a player seat to inspect private team rooms.
create or replace function private.can_read_chat_room(_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_rooms r
    where r.id = _room_id
      and (
        private.is_game_host(r.game_id)
        or exists (
          select 1
          from public.game_players gp
          where gp.game_id = r.game_id
            and gp.user_id = (select auth.uid())
            and gp.status <> 'left'
            and (
              r.type in ('town', 'system')
              or (r.type = 'mafia' and private.is_mafia(r.game_id))
              or (r.type = 'dead' and gp.status = 'dead')
            )
        )
      )
  );
$$;

revoke execute on function private.can_read_chat_room(uuid) from public, anon;
grant execute on function private.can_read_chat_room(uuid) to authenticated;

-- Votes are game-scoped public information; actions are not.  Re-declare the
-- read policy to explicitly include a seatless host as well as players.
drop policy if exists "Members can read votes" on public.votes;
create policy "Members and hosts can read votes"
  on public.votes for select to authenticated
  using (private.is_game_member(game_id) or private.is_game_host(game_id));

drop policy if exists "Members can read game events" on public.game_events;
create policy "Members and hosts can read game events"
  on public.game_events for select to authenticated
  using (private.is_game_member(game_id) or private.is_game_host(game_id));

