-------------------------------------------------------------------------------
-- WEB-47: In-app notifications + host dashboard
--
-- * Add `games.is_paused` so the host can pause/resume a running game.
-- * Publish `notifications` over Realtime so the bell updates live, and
--   `role_actions` so the host dashboard can reflect who has acted live.
-- * Add a trigger that raises an "unread chat" notification for the players who
--   can read a room (deduped to a single unread chat notification per game per
--   user) whenever a new chat message arrives.
--
-- RLS is unchanged: notifications stay owner-readable, and the host already may
-- insert game notifications (WEB-44). The trigger runs SECURITY DEFINER so it
-- can fan a chat notification out to other players regardless of who posted.
-------------------------------------------------------------------------------

-- Host pause/resume toggle.
alter table public.games
  add column if not exists is_paused boolean not null default false;

comment on column public.games.is_paused is
  'When true the host has paused the game: players cannot act or vote until it resumes.';

-------------------------------------------------------------------------------
-- Realtime: notifications (live bell) and role_actions (host "acted" status).
-------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'role_actions'
  ) then
    alter publication supabase_realtime add table public.role_actions;
  end if;
end $$;

-------------------------------------------------------------------------------
-- Unread-chat notifications.
--
-- On each new chat message, notify the players who can read that room (using the
-- same visibility rules as `private.can_read_chat_room`), excluding the sender.
-- Deduped to one unread 'chat' notification per (user, game) so an idle reader
-- gets a single "you have unread messages" flag rather than one per message.
-------------------------------------------------------------------------------
create or replace function private.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _room_type public.chat_room_type;
  _room_name text;
  _sender_user uuid;
begin
  select type, name into _room_type, _room_name
  from public.chat_rooms
  where id = new.room_id;

  if _room_type is null then
    return new;
  end if;

  if new.sender_id is not null then
    select user_id into _sender_user
    from public.game_players
    where id = new.sender_id;
  end if;

  insert into public.notifications (user_id, game_id, type, title, body)
  select
    gp.user_id,
    new.game_id,
    'chat',
    'New messages',
    'You have unread messages in the '
      || coalesce(_room_name, initcap(_room_type::text)) || ' chat.'
  from public.game_players gp
  left join public.game_player_roles gpr
    on gpr.player_id = gp.id and gpr.game_id = gp.game_id
  where gp.game_id = new.game_id
    and gp.status <> 'left'
    and (_sender_user is null or gp.user_id <> _sender_user)
    and (
      _room_type in ('town', 'system')
      or (_room_type = 'mafia' and gpr.alignment = 'mafia')
      or (_room_type = 'dead' and gp.status = 'dead')
    )
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = gp.user_id
        and n.game_id = new.game_id
        and n.type = 'chat'
        and n.read = false
    );

  return new;
end;
$$;

revoke execute on function private.notify_chat_message() from public, anon, authenticated;

drop trigger if exists chat_message_notify on public.chat_messages;
create trigger chat_message_notify
  after insert on public.chat_messages
  for each row
  execute function private.notify_chat_message();
