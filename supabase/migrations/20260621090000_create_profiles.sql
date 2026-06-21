-- WEB-40: profiles table backing auth + username setup.
--
-- A profile row is created automatically for every new auth user via a trigger.
-- `username` stays null until the user completes profile setup, and is unique
-- (case-insensitively). RLS is enabled with policies matching the access model:
-- profiles are readable by any authenticated user (needed to show other players),
-- but a user may only insert/update their own row.

create extension if not exists citext with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null
    or username ~ '^[A-Za-z0-9_]{3,20}$'
  )
);

comment on table public.profiles is 'Per-user public profile. Username is required before joining or creating games.';

alter table public.profiles enable row level security;

-- Authenticated users can read all profiles (player lobby, game participants).
create policy "Profiles are viewable by authenticated users"
  on public.profiles
  for select
  to authenticated
  using (true);

-- A user may create only their own profile row.
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- A user may update only their own profile row.
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Keep updated_at fresh on every update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Create a profile row whenever a new auth user signs up. Runs as definer so it
-- can write to public.profiles regardless of the inserting role; search_path is
-- pinned to empty and every name is fully qualified for safety.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- The function only ever runs from the trigger above. Triggers fire regardless
-- of EXECUTE grants, so revoke direct/RPC access to keep it off the public API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
