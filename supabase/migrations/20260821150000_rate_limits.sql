-- Atomic, database-backed fixed-window rate limiting for authenticated actions.
-- The table is intentionally inaccessible through the Data API; callers can
-- only consume their own bucket through the security-definer function below.
create table public.rate_limit_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  scope text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  primary key (user_id, action, scope)
);

alter table public.rate_limit_counters enable row level security;

create or replace function public.consume_rate_limit(
  p_action text,
  p_scope text default 'global'
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_counter public.rate_limit_counters%rowtype;
  v_limit integer;
  v_window_seconds integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_scope is null or length(p_scope) not between 1 and 128 then
    raise exception 'Invalid rate limit policy';
  end if;

  -- Policies must be owned by the database. Authenticated callers may select
  -- an action and scope, but cannot weaken its limit or reset its window by
  -- supplying different policy parameters.
  select policy.limit_count, policy.window_seconds
  into v_limit, v_window_seconds
  from (values
    ('game_create', 3, 3600),
    ('game_join', 8, 300),
    ('host_control', 4, 5),
    ('role_action', 4, 10),
    ('vote_change', 5, 10)
  ) as policy(action, limit_count, window_seconds)
  where policy.action = p_action;

  if v_limit is null then
    raise exception 'Unknown rate limit action';
  end if;

  insert into public.rate_limit_counters as counters (
    user_id, action, scope, window_started_at, attempt_count
  ) values (v_user_id, p_action, p_scope, v_now, 1)
  on conflict (user_id, action, scope) do update
  set window_started_at = case
        when counters.window_started_at + make_interval(secs => v_window_seconds) <= v_now
        then v_now else counters.window_started_at end,
      attempt_count = case
        when counters.window_started_at + make_interval(secs => v_window_seconds) <= v_now
        then 1 else counters.attempt_count + 1 end
  returning * into v_counter;

  allowed := v_counter.attempt_count <= v_limit;
  retry_after_seconds := case when allowed then 0 else greatest(
    1,
    ceil(extract(epoch from (
      v_counter.window_started_at + make_interval(secs => v_window_seconds) - v_now
    )))::integer
  ) end;
  return next;
end;
$$;

revoke all on table public.rate_limit_counters from anon, authenticated;
revoke all on function public.consume_rate_limit(text, text) from public;
grant execute on function public.consume_rate_limit(text, text) to authenticated;

-- Chat writes are also available through the Data API, so enforcing this limit
-- only in the Server Action would allow clients to bypass it. Keep the policy
-- fixed here and consume the bucket in the same transaction as every insert.
create or replace function private.enforce_chat_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_counter public.rate_limit_counters%rowtype;
  v_window_seconds constant integer := 2;
begin
  -- System messages are written by trusted database code and have no sender.
  if new.sender_id is null then
    return new;
  end if;

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  insert into public.rate_limit_counters as counters (
    user_id, action, scope, window_started_at, attempt_count
  ) values (
    v_user_id, 'chat_message', new.game_id::text, v_now, 1
  )
  on conflict (user_id, action, scope) do update
  set window_started_at = case
        when counters.window_started_at
          + make_interval(secs => v_window_seconds) <= v_now
        then v_now else counters.window_started_at end,
      attempt_count = case
        when counters.window_started_at
          + make_interval(secs => v_window_seconds) <= v_now
        then 1 else counters.attempt_count + 1 end
  returning * into v_counter;

  if v_counter.attempt_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'Chat messages are limited to one every 2 seconds';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_chat_message_rate_limit() from public;

drop trigger if exists enforce_chat_message_rate_limit on public.chat_messages;
create trigger enforce_chat_message_rate_limit
  before insert on public.chat_messages
  for each row execute function private.enforce_chat_message_rate_limit();
