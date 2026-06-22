-------------------------------------------------------------------------------
-- WEB-125: Web Push subscriptions (PWA lock-screen notifications)
--
-- Stores one row per browser/PWA push subscription so the server can fan a
-- native Web Push notification out to a user's devices (alongside the existing
-- in-app `notifications` rows). The actual push is sent server-side with the
-- service-role client, which bypasses RLS; these policies only govern what a
-- logged-in user may do to *their own* subscriptions from the browser.
-------------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Web Push (PWA) subscriptions per user; used to deliver lock-screen notifications.';

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Owner-only access. Sending happens via the service role (bypasses RLS).
drop policy if exists "Users can read their push subscriptions"
  on public.push_subscriptions;
create policy "Users can read their push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can insert their push subscriptions"
  on public.push_subscriptions;
create policy "Users can insert their push subscriptions"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their push subscriptions"
  on public.push_subscriptions;
create policy "Users can update their push subscriptions"
  on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their push subscriptions"
  on public.push_subscriptions;
create policy "Users can delete their push subscriptions"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
