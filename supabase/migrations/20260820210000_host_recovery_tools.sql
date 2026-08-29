-- WEB-62: host recovery support and live audit updates.

-- A removed player keeps an audit-safe row, but is no longer a game member for
-- RLS purposes and therefore cannot continue reading game data.
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
      and gp.status <> 'left'
  );
$$;

-- Phase reprocessing needs the host to reset/resolve submitted role actions.
create policy "Hosts update role actions for recovery"
  on public.role_actions for update to authenticated
  using (private.is_game_host(game_id))
  with check (private.is_game_host(game_id));

-- Keep an open host dashboard's audit panel current after a recovery action.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'host_actions'
  ) then
    alter publication supabase_realtime add table public.host_actions;
  end if;
end $$;

comment on table public.host_actions is
  'Immutable audit log of host moderation and recovery actions, including affected player and before/after payloads.';
