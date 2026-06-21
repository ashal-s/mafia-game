-- WEB-41: lobby support.
--
-- Adds a per-player ready flag and a per-game minimum player count (needed to
-- gate "start game"), and enables Supabase Realtime on the lobby tables so the
-- player list updates live. RLS still applies to realtime subscribers.

alter table public.game_players
  add column if not exists is_ready boolean not null default false;

alter table public.games
  add column if not exists min_players int not null default 5;

do $$ begin
  alter table public.games
    add constraint games_min_players_range check (min_players between 1 and 30);
exception when duplicate_object then null; end $$;

-- Add lobby tables to the realtime publication (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_players'
  ) then
    alter publication supabase_realtime add table public.game_players;
  end if;
end $$;
