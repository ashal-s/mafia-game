begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

-- Fixed IDs make failures readable. Fixtures are inserted as the database
-- owner, then assertions run as players, a prospective invitee, or the host.
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'host@rls.test'),
  ('10000000-0000-0000-0000-000000000002', 'town@rls.test'),
  ('10000000-0000-0000-0000-000000000003', 'mafia@rls.test'),
  ('10000000-0000-0000-0000-000000000004', 'invitee@rls.test');

insert into public.games (id, code, host_id, status) values
  ('20000000-0000-0000-0000-000000000001', 'RLS001', '10000000-0000-0000-0000-000000000001', 'in_progress'),
  ('20000000-0000-0000-0000-000000000002', 'RLS002', '10000000-0000-0000-0000-000000000001', 'in_progress'),
  ('20000000-0000-0000-0000-000000000003', 'RLS003', '10000000-0000-0000-0000-000000000001', 'lobby');

insert into public.game_players (id, game_id, user_id) values
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003');

insert into public.game_player_roles (game_id, player_id, user_id, role_id, alignment)
select '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', id, 'town'
from public.roles where key = 'villager';
insert into public.game_player_roles (game_id, player_id, user_id, role_id, alignment)
select '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', id, 'mafia'
from public.roles where key = 'mafia';

insert into public.game_phases (id, game_id, phase_number, phase_type, status)
values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'night', 'active');
insert into public.role_actions (id, game_id, phase_id, actor_id, target_id, action_type)
values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'kill');

insert into public.chat_rooms (id, game_id, type) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'town'),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'mafia');
insert into public.chat_messages (room_id, game_id, sender_id, body) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'public'),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'secret');
insert into public.notifications (user_id, game_id, type, title) values
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'test', 'town only'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'test', 'mafia only');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.profiles), 3::bigint, 'player reads public profiles for all players');
select is((select count(*) from public.games), 1::bigint, 'player reads joined game only');
select is((select count(*) from public.game_players), 2::bigint, 'player reads joined roster');
select is((select count(*) from public.game_player_roles), 1::bigint, 'town player reads only own role');
select is((select count(*) from public.role_actions), 0::bigint, 'town player cannot read mafia action');
select is((select count(*) from public.chat_rooms), 1::bigint, 'town player cannot read mafia room');
select is((select count(*) from public.chat_messages), 1::bigint, 'town player cannot read mafia message');
select is((select count(*) from public.notifications), 1::bigint, 'town player reads only own notification');
select lives_ok(
  $$update public.game_players set is_ready = true
    where id = '30000000-0000-0000-0000-000000000002'$$,
  'player can update their own readiness'
);
select ok(
  (select is_ready from public.game_players
   where id = '30000000-0000-0000-0000-000000000002'),
  'player readiness update is persisted'
);
select throws_ok(
  $$update public.game_players set is_muted = true
    where id = '30000000-0000-0000-0000-000000000002'$$,
  '42501',
  'Players may only update their own readiness state',
  'player cannot update their own moderation state'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.game_player_roles), 1::bigint, 'mafia player reads mafia role rows only');
select is((select count(*) from public.role_actions), 1::bigint, 'actor reads own action');
select is((select count(*) from public.chat_rooms), 2::bigint, 'mafia player reads town and mafia rooms');
select is((select count(*) from public.chat_messages), 2::bigint, 'mafia player reads mafia messages');
select is((select count(*) from public.notifications), 1::bigint, 'mafia player reads only own notification');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.games), 1::bigint, 'invitee can resolve a joinable lobby');
select is((select code from public.games), 'RLS003', 'invitee cannot discover started games');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.games), 3::bigint, 'host reads every hosted game');
select is((select count(*) from public.game_players), 2::bigint, 'seatless host reads hosted roster');
select is((select count(*) from public.game_player_roles), 2::bigint, 'host reads every role');
select is((select count(*) from public.role_actions), 1::bigint, 'host reads every private action');

select * from finish();
rollback;
