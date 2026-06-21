-- WEB-41: enforce lobby join rules at the database level.
--
-- A BEFORE INSERT trigger guarantees players can only join a game that is still
-- in the lobby and not yet full, regardless of how the insert is issued. The
-- unique (game_id, user_id) constraint already prevents joining twice.
--
-- Runs as SECURITY DEFINER so it can read games/game_players consistently;
-- EXECUTE is revoked from API roles (triggers fire regardless of that grant).

create or replace function public.enforce_game_join_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  game_status public.game_status;
  game_max int;
  current_count int;
begin
  select g.status, g.max_players
    into game_status, game_max
  from public.games g
  where g.id = new.game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  if game_status <> 'lobby' then
    raise exception 'This game is no longer accepting players';
  end if;

  select count(*) into current_count
  from public.game_players
  where game_id = new.game_id;

  if current_count >= game_max then
    raise exception 'This game is full';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_game_join_rules() from public, anon, authenticated;

create trigger game_players_enforce_join
  before insert on public.game_players
  for each row
  execute function public.enforce_game_join_rules();
