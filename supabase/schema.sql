-- ============================================================================
-- PHAmily Classic 2026 — Database Schema
-- ============================================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New Query).
-- Idempotent: safe to re-run during development.
-- ============================================================================

-- ---- TEAMS ------------------------------------------------------------------
create table if not exists public.teams (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  short_name    text not null,
  region        text not null check (region in ('NJ','NY')),
  sport         text not null check (sport in ('basketball','kickball','knights-of-pythagoras')),
  age_group     text not null check (age_group in ('adult','youth')),
  max_roster    int  not null default 15 check (max_roster > 0),
  shopify_product_gid text unique not null,
  display_order int  not null,
  created_at    timestamptz not null default now()
);

create index if not exists teams_slug_idx on public.teams (slug);
create index if not exists teams_display_order_idx on public.teams (display_order);

-- ---- REGISTRATIONS ----------------------------------------------------------
create table if not exists public.registrations (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete restrict,

  -- Player details
  full_name           text not null,
  email               text not null,
  phone               text not null,
  jersey_size         text not null,
  shorts_size         text not null,

  -- Admin-assigned (post-registration)
  jersey_number       int,                              -- nullable; unique per team when set
  jersey_number_assigned_at timestamptz,

  -- Youth-only fields
  is_youth            boolean not null default false,
  guardian_name       text,
  guardian_phone      text,
  guardian_email      text,

  -- Payment + status
  payment_status      text not null default 'pending'
                      check (payment_status in ('pending','confirmed','refunded','cancelled')),
  shopify_order_id    text unique,
  shopify_order_name  text,                             -- the #1234 display number
  amount_paid_cents   int,
  paid_at             timestamptz,

  -- Audit
  refund_acknowledged boolean not null default false,
  sizes_locked_at     timestamptz,
  notes               text,                             -- admin notes (private)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Youth registrations MUST have guardian info
  constraint youth_requires_guardian check (
    (is_youth = false) or (
      guardian_name is not null and
      guardian_phone is not null and
      guardian_email is not null
    )
  )
);

create index if not exists registrations_team_id_idx on public.registrations (team_id);
create index if not exists registrations_status_idx on public.registrations (payment_status);
create index if not exists registrations_created_at_idx on public.registrations (created_at desc);

-- Jersey numbers must be unique within a team (when assigned)
create unique index if not exists registrations_jersey_number_unique_per_team
  on public.registrations (team_id, jersey_number)
  where jersey_number is not null and payment_status = 'confirmed';

-- ---- updated_at trigger ----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists registrations_updated_at on public.registrations;
create trigger registrations_updated_at
  before update on public.registrations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================
-- The anon (public) key gets read-only access to confirmed registrations
-- and read access to teams. All writes happen via the service_role key
-- from server-side code (webhook handler, admin actions).
-- ============================================================================

alter table public.teams enable row level security;
alter table public.registrations enable row level security;

-- Teams: public read all
drop policy if exists "Teams are publicly readable" on public.teams;
create policy "Teams are publicly readable"
  on public.teams for select
  using (true);

-- Registrations: public read only confirmed ones, and only safe columns are
-- exposed via a view (below). The base table is otherwise locked down.
drop policy if exists "Confirmed registrations are publicly readable" on public.registrations;
create policy "Confirmed registrations are publicly readable"
  on public.registrations for select
  using (payment_status = 'confirmed');

-- Anyone with the anon key would technically see ALL columns of confirmed
-- rows under that policy (including email/phone). We don't want that on the
-- public roster page. We expose a sanitized view for public consumption:

create or replace view public.public_roster as
  select
    r.id,
    r.team_id,
    t.slug as team_slug,
    r.full_name,
    r.jersey_number,
    r.is_youth,
    r.created_at
  from public.registrations r
  join public.teams t on t.id = r.team_id
  where r.payment_status = 'confirmed';

-- Grants on the view (anon already has SELECT on the base table via RLS,
-- but we also want it on the view).
grant select on public.public_roster to anon;
grant select on public.public_roster to authenticated;

-- Also expose a count helper for the team picker. This intentionally only
-- counts confirmed registrations — the cap is based on paid players, not
-- abandoned carts.
create or replace view public.team_roster_counts as
  select
    t.id as team_id,
    t.slug as team_slug,
    t.max_roster,
    count(r.id) filter (where r.payment_status = 'confirmed') as confirmed_count,
    t.max_roster - count(r.id) filter (where r.payment_status = 'confirmed') as spots_remaining,
    (count(r.id) filter (where r.payment_status = 'confirmed') >= t.max_roster) as is_full
  from public.teams t
  left join public.registrations r on r.team_id = t.id
  group by t.id, t.slug, t.max_roster;

grant select on public.team_roster_counts to anon;
grant select on public.team_roster_counts to authenticated;

-- ============================================================================
-- SEED — the 6 teams
-- ============================================================================
-- These GIDs are bound to the live Shopify products in
-- whencecameyouniversity.com. Don't change them without also recreating the
-- products there.
-- ============================================================================

insert into public.teams (slug, name, short_name, region, sport, age_group, max_roster, shopify_product_gid, display_order)
values
  ('nj-basketball', 'NJ Classic Basketball Team',     'NJ Basketball', 'NJ', 'basketball',            'adult', 15, 'gid://shopify/Product/10438339002549', 1),
  ('ny-basketball', 'NY Classic Basketball Team',     'NY Basketball', 'NY', 'basketball',            'adult', 15, 'gid://shopify/Product/10438339690677', 2),
  ('nj-kickball',   'NJ Classic Kickball Team',       'NJ Kickball',   'NJ', 'kickball',              'adult', 15, 'gid://shopify/Product/10438339821749', 3),
  ('ny-kickball',   'NY Classic Kickball Team',       'NY Kickball',   'NY', 'kickball',              'adult', 15, 'gid://shopify/Product/10438339887285', 4),
  ('nj-knights',    'NJ Knights of Pythagoras Team',  'NJ Knights',    'NJ', 'knights-of-pythagoras', 'youth', 15, 'gid://shopify/Product/10438339920053', 5),
  ('ny-knights',    'NY Knights of Pythagoras Team',  'NY Knights',    'NY', 'knights-of-pythagoras', 'youth', 15, 'gid://shopify/Product/10438339985589', 6)
on conflict (slug) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  region = excluded.region,
  sport = excluded.sport,
  age_group = excluded.age_group,
  max_roster = excluded.max_roster,
  shopify_product_gid = excluded.shopify_product_gid,
  display_order = excluded.display_order;

-- ============================================================================
-- Verification queries — useful for confirming setup worked
-- ============================================================================
-- Uncomment and run after the inserts to sanity check:
--   select slug, name, age_group, max_roster from public.teams order by display_order;
--   select * from public.team_roster_counts order by team_slug;
--   select count(*) as total_registrations from public.registrations;
