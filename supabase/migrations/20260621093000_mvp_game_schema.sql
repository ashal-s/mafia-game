-- WEB-55: MVP database schema and seed data for the Mafia game.
--
-- Depends on the `profiles` table from WEB-40.
--
-- Adds the core game tables (games, players, roles/presets, phases, actions,
-- votes, chat, notifications, host actions, and an event log), enables RLS on
-- every table, and seeds the MVP roles and presets.
--
-- Access model: catalog tables (roles/presets) are readable by any authenticated
-- user. Game data is visible to participants of that game; hosts can manage their
-- own games. Membership/host checks use SECURITY DEFINER helpers in a private
-- (unexposed) schema to avoid recursive RLS evaluation.

-------------------------------------------------------------------------------
-- Enums
-------------------------------------------------------------------------------
do $$ begin
  create type public.role_alignment as enum ('town', 'mafia', 'neutral');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.game_status as enum ('lobby', 'in_progress', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.game_player_status as enum ('alive', 'dead', 'left');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.game_phase_type as enum ('day', 'night');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.game_phase_status as enum ('pending', 'active', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.chat_room_type as enum ('town', 'mafia', 'dead', 'system');
exception when duplicate_object then null; end $$;

-------------------------------------------------------------------------------
-- Private helper schema (not exposed via the Data API)
-------------------------------------------------------------------------------
create schema if not exists private;

-------------------------------------------------------------------------------
-- Catalog: roles
-------------------------------------------------------------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  alignment public.role_alignment not null,
  ability text not null default 'none',
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.roles is 'Catalog of playable roles.';
comment on column public.roles.ability is 'Machine key for the role''s night/day ability (e.g. kill, investigate, heal, extra_vote, none).';

-------------------------------------------------------------------------------
-- Catalog: role presets and their composition
-------------------------------------------------------------------------------
create table if not exists public.role_presets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  min_players int not null,
  max_players int not null,
  created_at timestamptz not null default now(),
  constraint role_presets_player_range check (min_players >= 1 and max_players >= min_players)
);

comment on table public.role_presets is 'Named role configurations selectable when creating a game.';

create table if not exists public.role_preset_items (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references public.role_presets (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  count int not null check (count > 0),
  unique (preset_id, role_id)
);

comment on table public.role_preset_items is 'Baseline count of each role in a preset; extra players above the baseline fill in as villagers.';

-------------------------------------------------------------------------------
-- Games
-------------------------------------------------------------------------------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  host_id uuid not null references public.profiles (id) on delete cascade,
  preset_id uuid references public.role_presets (id) on delete set null,
  status public.game_status not null default 'lobby',
  max_players int not null default 15 check (max_players between 3 and 30),
  winner_alignment public.role_alignment,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

comment on table public.games is 'A single game instance / room.';

create index if not exists games_host_id_idx on public.games (host_id);
create index if not exists games_status_idx on public.games (status);

-------------------------------------------------------------------------------
-- Game players
-------------------------------------------------------------------------------
create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid references public.roles (id) on delete set null,
  seat int,
  is_host boolean not null default false,
  status public.game_player_status not null default 'alive',
  joined_at timestamptz not null default now(),
  eliminated_at timestamptz,
  unique (game_id, user_id),
  unique (game_id, seat)
);

comment on table public.game_players is 'Membership and per-game state for each player in a game.';

create index if not exists game_players_game_id_idx on public.game_players (game_id);
create index if not exists game_players_user_id_idx on public.game_players (user_id);
create index if not exists game_players_role_id_idx on public.game_players (role_id);

-------------------------------------------------------------------------------
-- Game phases (day/night rounds)
-------------------------------------------------------------------------------
create table if not exists public.game_phases (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  phase_number int not null,
  phase_type public.game_phase_type not null,
  day_number int not null default 1,
  status public.game_phase_status not null default 'pending',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (game_id, phase_number)
);

comment on table public.game_phases is 'Sequential day/night phases within a game.';

create index if not exists game_phases_game_id_idx on public.game_phases (game_id);

-------------------------------------------------------------------------------
-- Role actions (night/day ability usage)
-------------------------------------------------------------------------------
create table if not exists public.role_actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  phase_id uuid not null references public.game_phases (id) on delete cascade,
  actor_id uuid not null references public.game_players (id) on delete cascade,
  target_id uuid references public.game_players (id) on delete set null,
  action_type text not null,
  result jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.role_actions is 'Ability actions taken by players during a phase (e.g. kill, investigate, heal).';

create index if not exists role_actions_game_id_idx on public.role_actions (game_id);
create index if not exists role_actions_phase_id_idx on public.role_actions (phase_id);
create index if not exists role_actions_actor_id_idx on public.role_actions (actor_id);

-------------------------------------------------------------------------------
-- Votes
-------------------------------------------------------------------------------
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  phase_id uuid not null references public.game_phases (id) on delete cascade,
  voter_id uuid not null references public.game_players (id) on delete cascade,
  target_id uuid references public.game_players (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (phase_id, voter_id)
);

comment on table public.votes is 'One vote per player per phase; null target means abstain/skip.';

create index if not exists votes_game_id_idx on public.votes (game_id);
create index if not exists votes_phase_id_idx on public.votes (phase_id);

-------------------------------------------------------------------------------
-- Chat rooms and messages
-------------------------------------------------------------------------------
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  type public.chat_room_type not null,
  name text,
  created_at timestamptz not null default now()
);

comment on table public.chat_rooms is 'Per-game chat channels (town, mafia, dead, system).';

create index if not exists chat_rooms_game_id_idx on public.chat_rooms (game_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  sender_id uuid references public.game_players (id) on delete set null,
  body text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.chat_messages is 'Messages within a chat room. System messages have a null sender.';

create index if not exists chat_messages_room_id_idx on public.chat_messages (room_id);
create index if not exists chat_messages_game_id_idx on public.chat_messages (game_id);

-------------------------------------------------------------------------------
-- Notifications
-------------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid references public.games (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'Per-user notifications, optionally tied to a game.';

create index if not exists notifications_user_id_idx on public.notifications (user_id);

-------------------------------------------------------------------------------
-- Host actions (moderation log)
-------------------------------------------------------------------------------
create table if not exists public.host_actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  host_id uuid not null references public.profiles (id) on delete cascade,
  action_type text not null,
  target_player_id uuid references public.game_players (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.host_actions is 'Audit log of host/moderator actions (kick, force phase, assign role, etc.).';

create index if not exists host_actions_game_id_idx on public.host_actions (game_id);

-------------------------------------------------------------------------------
-- Game events (timeline / audit log)
-------------------------------------------------------------------------------
create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  phase_id uuid references public.game_phases (id) on delete set null,
  actor_id uuid references public.game_players (id) on delete set null,
  event_type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.game_events is 'Chronological event log for a game (joins, eliminations, phase changes, etc.).';

create index if not exists game_events_game_id_idx on public.game_events (game_id);

-------------------------------------------------------------------------------
-- updated_at trigger for games (reuses public.set_updated_at from WEB-40)
-------------------------------------------------------------------------------
create trigger games_set_updated_at
  before update on public.games
  for each row
  execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- RLS membership helpers (SECURITY DEFINER, in private schema)
-------------------------------------------------------------------------------
create or replace function private.is_game_member(_game_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_players gp
    where gp.game_id = _game_id
      and gp.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_game_host(_game_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.games g
    where g.id = _game_id
      and g.host_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_game_member(uuid) from public, anon, authenticated;
revoke execute on function private.is_game_host(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Enable RLS on every table
-------------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.role_presets enable row level security;
alter table public.role_preset_items enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_phases enable row level security;
alter table public.role_actions enable row level security;
alter table public.votes enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.host_actions enable row level security;
alter table public.game_events enable row level security;

-------------------------------------------------------------------------------
-- Policies: catalog tables (read-only for authenticated; writes via migrations)
-------------------------------------------------------------------------------
create policy "Roles are readable by authenticated users"
  on public.roles for select to authenticated using (true);

create policy "Presets are readable by authenticated users"
  on public.role_presets for select to authenticated using (true);

create policy "Preset items are readable by authenticated users"
  on public.role_preset_items for select to authenticated using (true);

-------------------------------------------------------------------------------
-- Policies: games
-------------------------------------------------------------------------------
create policy "Games are visible to members, host, or while joinable"
  on public.games for select to authenticated
  using (
    status = 'lobby'
    or host_id = (select auth.uid())
    or private.is_game_member(id)
  );

create policy "Users can create games they host"
  on public.games for insert to authenticated
  with check (host_id = (select auth.uid()));

create policy "Hosts can update their games"
  on public.games for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

create policy "Hosts can delete their games"
  on public.games for delete to authenticated
  using (host_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- Policies: game_players
-------------------------------------------------------------------------------
create policy "Players in a game can see its roster"
  on public.game_players for select to authenticated
  using (private.is_game_member(game_id) or private.is_game_host(game_id));

create policy "Users can add themselves to a game"
  on public.game_players for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_game_host(game_id));

create policy "Players or host can update player rows"
  on public.game_players for update to authenticated
  using (user_id = (select auth.uid()) or private.is_game_host(game_id))
  with check (user_id = (select auth.uid()) or private.is_game_host(game_id));

create policy "Players can leave or host can remove players"
  on public.game_players for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_game_host(game_id));

-------------------------------------------------------------------------------
-- Policies: game_phases (members read, host writes)
-------------------------------------------------------------------------------
create policy "Members can read phases"
  on public.game_phases for select to authenticated
  using (private.is_game_member(game_id));

create policy "Hosts manage phases"
  on public.game_phases for all to authenticated
  using (private.is_game_host(game_id))
  with check (private.is_game_host(game_id));

-------------------------------------------------------------------------------
-- Policies: role_actions (actor or host can see; actor inserts own)
-------------------------------------------------------------------------------
create policy "Actor or host can read role actions"
  on public.role_actions for select to authenticated
  using (
    private.is_game_host(game_id)
    or exists (
      select 1 from public.game_players gp
      where gp.id = role_actions.actor_id
        and gp.user_id = (select auth.uid())
    )
  );

create policy "Players insert their own role actions"
  on public.role_actions for insert to authenticated
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = role_actions.actor_id
        and gp.user_id = (select auth.uid())
        and gp.game_id = role_actions.game_id
    )
  );

-------------------------------------------------------------------------------
-- Policies: votes (members read, voter casts/updates own)
-------------------------------------------------------------------------------
create policy "Members can read votes"
  on public.votes for select to authenticated
  using (private.is_game_member(game_id));

create policy "Players cast their own vote"
  on public.votes for insert to authenticated
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = votes.voter_id
        and gp.user_id = (select auth.uid())
        and gp.game_id = votes.game_id
    )
  );

create policy "Players update their own vote"
  on public.votes for update to authenticated
  using (
    exists (
      select 1 from public.game_players gp
      where gp.id = votes.voter_id
        and gp.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = votes.voter_id
        and gp.user_id = (select auth.uid())
    )
  );

-------------------------------------------------------------------------------
-- Policies: chat_rooms (members read, host manages)
-------------------------------------------------------------------------------
create policy "Members can read chat rooms"
  on public.chat_rooms for select to authenticated
  using (private.is_game_member(game_id));

create policy "Hosts manage chat rooms"
  on public.chat_rooms for all to authenticated
  using (private.is_game_host(game_id))
  with check (private.is_game_host(game_id));

-------------------------------------------------------------------------------
-- Policies: chat_messages (members read, sender posts own)
-------------------------------------------------------------------------------
create policy "Members can read chat messages"
  on public.chat_messages for select to authenticated
  using (private.is_game_member(game_id));

create policy "Players post their own chat messages"
  on public.chat_messages for insert to authenticated
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = chat_messages.sender_id
        and gp.user_id = (select auth.uid())
        and gp.game_id = chat_messages.game_id
    )
  );

-------------------------------------------------------------------------------
-- Policies: notifications (owner only)
-------------------------------------------------------------------------------
create policy "Users can read their notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can update their notifications"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their notifications"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- Policies: host_actions (host only)
-------------------------------------------------------------------------------
create policy "Hosts can read their host actions"
  on public.host_actions for select to authenticated
  using (private.is_game_host(game_id));

create policy "Hosts can insert host actions"
  on public.host_actions for insert to authenticated
  with check (private.is_game_host(game_id) and host_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- Policies: game_events (members read, host writes; service role bypasses RLS)
-------------------------------------------------------------------------------
create policy "Members can read game events"
  on public.game_events for select to authenticated
  using (private.is_game_member(game_id));

create policy "Hosts can insert game events"
  on public.game_events for insert to authenticated
  with check (private.is_game_host(game_id));

-------------------------------------------------------------------------------
-- Seed data: MVP roles
-------------------------------------------------------------------------------
insert into public.roles (key, name, alignment, ability, description, sort_order)
values
  ('mafia', 'Mafia', 'mafia', 'kill',
    'The private team. Each night, the mafia collectively choose a player to eliminate. They win when they equal or outnumber the town.', 1),
  ('detective', 'Detective', 'town', 'investigate',
    'Each night, investigate one player to learn whether they are aligned with the mafia.', 2),
  ('healer', 'Healer', 'town', 'heal',
    'Each night, choose one player to protect from elimination.', 3),
  ('mayor', 'Mayor', 'town', 'extra_vote',
    'A respected townsperson whose vote carries extra weight during the day.', 4),
  ('villager', 'Villager', 'town', 'none',
    'An ordinary townsperson with no special ability. Win by eliminating the mafia.', 5)
on conflict (key) do update
  set name = excluded.name,
      alignment = excluded.alignment,
      ability = excluded.ability,
      description = excluded.description,
      sort_order = excluded.sort_order;

-------------------------------------------------------------------------------
-- Seed data: MVP presets
-------------------------------------------------------------------------------
insert into public.role_presets (key, name, description, min_players, max_players)
values
  ('classic_small', 'Classic Small Game',
    'A quick game for a small group.', 5, 8),
  ('standard', 'Standard Game',
    'The standard experience for a medium-sized group.', 9, 15)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      min_players = excluded.min_players,
      max_players = excluded.max_players;

-------------------------------------------------------------------------------
-- Seed data: preset compositions (baseline at the preset's minimum player count)
-------------------------------------------------------------------------------
insert into public.role_preset_items (preset_id, role_id, count)
select p.id, r.id, v.count
from (
  values
    ('classic_small', 'mafia', 1),
    ('classic_small', 'detective', 1),
    ('classic_small', 'healer', 1),
    ('classic_small', 'villager', 2),
    ('standard', 'mafia', 2),
    ('standard', 'detective', 1),
    ('standard', 'healer', 1),
    ('standard', 'mayor', 1),
    ('standard', 'villager', 4)
) as v (preset_key, role_key, count)
join public.role_presets p on p.key = v.preset_key
join public.roles r on r.key = v.role_key
on conflict (preset_id, role_id) do update
  set count = excluded.count;
