-- =============================================================================
-- NorthReserve Mountain — Supabase schema
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL -> New query -> Run).
-- Gives you: passwordless accounts (auth.users), a synced per-user state blob,
-- a check-ins log (the retention metric), per-user Row-Level Security, and a
-- trigger so a user can NEVER grant themselves membership from the browser —
-- only the Stripe webhook (service role) can.
-- =============================================================================

-- ---------- PROFILES ---------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text,
  display_name          text,
  membership_status     text not null default 'free',   -- 'free' | 'member'
  membership_plan       text,                            -- 'monthly' | 'annual' | null
  stripe_customer_id    text,
  stripe_subscription_id text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------- SYNCED STATE (cross-device mountain) -----------------------------
-- One row per user. `state` holds { mountain, history, goals, milestones }.
create table if not exists public.mountain_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- CHECK-INS (THE RETENTION METRIC) ---------------------------------
-- One row per save/check-in. This is what answers "do people come back monthly?"
create table if not exists public.checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  overall    int,
  stage      text,
  month      text,            -- 'YYYY-MM' for easy monthly grouping
  source     text             -- 'saved' | 'checkin'
);
create index if not exists checkins_user_month_idx on public.checkins (user_id, month);

-- =============================================================================
-- ROW-LEVEL SECURITY — every user sees and writes ONLY their own rows
-- =============================================================================
alter table public.profiles      enable row level security;
alter table public.mountain_state enable row level security;
alter table public.checkins      enable row level security;

drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile write"  on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile write"  on public.profiles for update using (auth.uid() = id);

drop policy if exists "own state all" on public.mountain_state;
create policy "own state all" on public.mountain_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own checkins read"   on public.checkins;
drop policy if exists "own checkins insert" on public.checkins;
create policy "own checkins read"   on public.checkins for select using (auth.uid() = user_id);
create policy "own checkins insert" on public.checkins for insert with check (auth.uid() = user_id);

-- =============================================================================
-- GUARDS / AUTOMATION
-- =============================================================================

-- Auto-create a profile row the moment a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stop the BROWSER from granting membership. Only the service role (the Stripe
-- webhook) may change membership_status / plan / stripe_*. Users can still edit
-- their email and display_name.
create or replace function public.guard_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    new.membership_status      := old.membership_status;
    new.membership_plan        := old.membership_plan;
    new.stripe_customer_id     := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_membership();

-- =============================================================================
-- THE HYPOTHESIS QUERY — "do people come back month after month?"
-- =============================================================================
-- Per-user: how many distinct months they checked in, first and last.
create or replace view public.nr_retention as
select
  user_id,
  count(distinct month)                      as active_months,
  min(created_at)                            as first_seen,
  max(created_at)                            as last_seen,
  (count(distinct month) >= 2)               as returned
from public.checkins
group by user_id;

-- Run these any time to read the result:
--   -- % of savers who came back in a later month:
--   select round(100.0 * avg(case when returned then 1 else 0 end), 1) as pct_returned,
--          count(*) as total_users
--   from public.nr_retention;
--
--   -- monthly active users (distinct users who checked in each month):
--   select month, count(distinct user_id) as active_users
--   from public.checkins group by month order by month;

-- =============================================================================
-- TABLE GRANTS  (fixes "permission denied for table" / Postgres error 42501)
-- Supabase usually applies these automatically; making them explicit guarantees
-- the webhook (service_role) and signed-in users (authenticated) can reach the
-- tables. The RLS policies above still restrict 'authenticated' to their OWN
-- rows; 'service_role' bypasses RLS by design.
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant all privileges on table public.profiles       to service_role;
grant all privileges on table public.mountain_state to service_role;
grant all privileges on table public.checkins       to service_role;

grant select, insert, update         on table public.profiles       to authenticated;
grant select, insert, update, delete on table public.mountain_state to authenticated;
grant select, insert                 on table public.checkins       to authenticated;
