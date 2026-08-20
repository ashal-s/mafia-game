-- WEB-59: distinguish the public game history from sensitive host audit detail.
alter table public.game_events
  add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'host'));

create index if not exists game_events_timeline_idx
  on public.game_events (game_id, created_at);

-- Old vote rows included the per-player tally. Keep the public outcome without
-- exposing private ballots in existing games.
update public.game_events
set data = data - 'tally'
where event_type = 'voting_resolved' and data ? 'tally';

drop policy if exists "Members can read game events" on public.game_events;
create policy "Members can read visible game events"
  on public.game_events for select to authenticated
  using (
    private.is_game_member(game_id)
    and (visibility = 'public' or private.is_game_host(game_id))
  );

comment on column public.game_events.visibility is
  'Public events are readable by game members; host events are restricted to the game host by RLS.';
