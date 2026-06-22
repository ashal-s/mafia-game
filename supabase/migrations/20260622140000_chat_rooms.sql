-------------------------------------------------------------------------------
-- WEB-46: Main chat, Mafia chat, Dead chat + restrictions & muting
--
-- The chat_rooms / chat_messages tables already exist (WEB-55), but their RLS
-- let *any* game member read *every* message — which would leak the mafia and
-- dead channels. This migration:
--   * adds a per-player `is_muted` flag for host moderation,
--   * adds room-aware read/write helpers and rewrites the chat policies so each
--     room is only visible/writable to the right players,
--   * publishes chat_messages for realtime so messages appear without a refresh.
--
-- Room access model:
--   town  — every member reads; only living players write.
--   mafia — mafia (alive or dead) + host read; only living mafia write.
--   dead  — dead players (+ host) read; only dead players write.
--   Muted or removed players can never write.
-------------------------------------------------------------------------------

-- Host moderation: mute a player so they can read but not send.
alter table public.game_players
  add column if not exists is_muted boolean not null default false;

-------------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so they bypass RLS and avoid policy recursion)
-------------------------------------------------------------------------------

-- Can the current user *read* the given chat room?
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
    join public.game_players gp
      on gp.game_id = r.game_id
     and gp.user_id = (select auth.uid())
    where r.id = _room_id
      and gp.status <> 'left'
      and (
        private.is_game_host(r.game_id)
        or r.type in ('town', 'system')
        or (r.type = 'mafia' and private.is_mafia(r.game_id))
        or (r.type = 'dead' and gp.status = 'dead')
      )
  );
$$;

revoke execute on function private.can_read_chat_room(uuid) from public, anon;
grant execute on function private.can_read_chat_room(uuid) to authenticated;

-- Can the current user *post* in the given chat room?
create or replace function private.can_post_chat_room(_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_rooms r
    join public.game_players gp
      on gp.game_id = r.game_id
     and gp.user_id = (select auth.uid())
    where r.id = _room_id
      and gp.status <> 'left'
      and gp.is_muted = false
      and (
        (r.type = 'town' and gp.status = 'alive')
        or (r.type = 'mafia' and gp.status = 'alive' and private.is_mafia(r.game_id))
        or (r.type = 'dead' and gp.status = 'dead')
      )
  );
$$;

revoke execute on function private.can_post_chat_room(uuid) from public, anon;
grant execute on function private.can_post_chat_room(uuid) to authenticated;

-------------------------------------------------------------------------------
-- Tighten chat_rooms read: only rooms the user is allowed to see.
-------------------------------------------------------------------------------
drop policy if exists "Members can read chat rooms" on public.chat_rooms;
create policy "Members can read chat rooms"
  on public.chat_rooms for select to authenticated
  using (private.can_read_chat_room(id));

-------------------------------------------------------------------------------
-- Tighten chat_messages read + write to respect room access.
-------------------------------------------------------------------------------
drop policy if exists "Members can read chat messages" on public.chat_messages;
create policy "Members can read chat messages"
  on public.chat_messages for select to authenticated
  using (private.can_read_chat_room(room_id));

drop policy if exists "Players post their own chat messages" on public.chat_messages;
create policy "Players post their own chat messages"
  on public.chat_messages for insert to authenticated
  with check (
    private.can_post_chat_room(room_id)
    and exists (
      select 1 from public.game_players gp
      where gp.id = chat_messages.sender_id
        and gp.user_id = (select auth.uid())
        and gp.game_id = chat_messages.game_id
    )
  );

-------------------------------------------------------------------------------
-- Realtime: stream new messages so the client updates without a refresh.
-------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
