-- WEB-42 follow-up: drop the Mayor role from the MVP and replace it with a
-- Sniper. The Sniper is town-aligned and has a limited number of bullets to
-- shoot a player during the night.
--
-- We convert the existing Mayor row in place (rather than delete + insert) so
-- that any preset compositions or assigned games that reference the role keep
-- pointing at a valid role. Idempotent: re-running after the rename is a no-op.

update public.roles
set
  key = 'sniper',
  name = 'Sniper',
  alignment = 'town',
  ability = 'shoot',
  description = 'A sharpshooter on the town''s side. Holds a limited supply of bullets to shoot a player during the night — aim carefully to take down the mafia.',
  sort_order = 4
where key = 'mayor';
