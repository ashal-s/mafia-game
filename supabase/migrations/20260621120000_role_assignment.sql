-- WEB-42: role assignment storage + visibility.
--
-- Secret per-player role assignments live in their own table, NOT on
-- game_players. game_players is in the supabase_realtime publication (WEB-41),
-- and realtime payloads include every column regardless of column privileges —
-- so storing roles there would broadcast them to every lobby subscriber.
-- game_player_roles is intentionally left out of the realtime publication and
-- gated by row-level policies that implement the reveal rules:
--   * a player sees only their own role,
--   * mafia players also see their mafia teammates,
--   * the host sees every role (moderation / testing).

create table if not exists public.game_player_roles (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.game_players (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id),
  alignment public.role_alignment not null,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id),
  unique (game_id, user_id)
);

comment on table public.game_player_roles is
  'Secret per-player role assignments. Kept off the realtime publication and gated by RLS so roles are not leaked to other players.';

create index if not exists game_player_roles_user_id_idx
  on public.game_player_roles (user_id);

alter table public.game_player_roles enable row level security;

-- Private helper: is the current user a mafia member of this game? SECURITY
-- DEFINER so it bypasses RLS on game_player_roles and avoids policy recursion.
create or replace function private.is_mafia(_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_player_roles gpr
    where gpr.game_id = _game_id
      and gpr.user_id = (select auth.uid())
      and gpr.alignment = 'mafia'
  );
$$;

revoke execute on function private.is_mafia(uuid) from public, anon;
grant execute on function private.is_mafia(uuid) to authenticated;

-- Visibility: own role, mafia teammates (for mafia), or everything (for host).
create policy "Players see their own role, mafia teammates, host sees all"
  on public.game_player_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_game_host(game_id)
    or (alignment = 'mafia' and private.is_mafia(game_id))
  );

-- Only the host writes assignments (done by the start-game server action).
create policy "Host assigns roles"
  on public.game_player_roles for insert to authenticated
  with check (private.is_game_host(game_id));

create policy "Host can update roles"
  on public.game_player_roles for update to authenticated
  using (private.is_game_host(game_id))
  with check (private.is_game_host(game_id));

create policy "Host can clear roles"
  on public.game_player_roles for delete to authenticated
  using (private.is_game_host(game_id));
