-- Complete a claimed phase and open its successor in one database transaction.
-- If any write fails (including the unique open-phase constraint), PostgreSQL
-- rolls the whole function call back and leaves the claimed phase processing.
create or replace function public.complete_phase_and_open_successor(
  p_current_phase_id uuid,
  p_game_id uuid,
  p_phase_number integer,
  p_phase_type public.game_phase_type,
  p_day_number integer,
  p_started_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  next_phase_id uuid;
begin
  update public.game_phases
  set status = 'completed', ended_at = p_started_at
  where id = p_current_phase_id
    and game_id = p_game_id
    and status = 'processing';

  if not found then
    return null;
  end if;

  insert into public.game_phases (
    game_id,
    phase_number,
    phase_type,
    day_number,
    status,
    started_at,
    ends_at
  ) values (
    p_game_id,
    p_phase_number,
    p_phase_type,
    p_day_number,
    'active',
    p_started_at,
    p_ends_at
  )
  returning id into next_phase_id;

  update public.games
  set current_phase_id = next_phase_id
  where id = p_game_id;

  return next_phase_id;
end;
$function$;

revoke all on function public.complete_phase_and_open_successor(
  uuid, uuid, integer, public.game_phase_type, integer, timestamptz, timestamptz
) from public;
grant execute on function public.complete_phase_and_open_successor(
  uuid, uuid, integer, public.game_phase_type, integer, timestamptz, timestamptz
) to authenticated, service_role;
