create table if not exists public.team_pledges (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  side text not null check (side in ('NY','NJ')),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_pledges_side_idx on public.team_pledges (side);

alter table public.team_pledges enable row level security;

-- Anyone can read aggregate count via the view (below)
-- Anyone can insert/update their own pledge by device_id

drop policy if exists "Anyone can insert pledges" on public.team_pledges;
create policy "Anyone can insert pledges"
  on public.team_pledges for insert
  with check (true);

drop policy if exists "Anyone can update their own pledge" on public.team_pledges;
create policy "Anyone can update their own pledge"
  on public.team_pledges for update
  using (true)
  with check (true);

drop policy if exists "Pledges are publicly readable" on public.team_pledges;
create policy "Pledges are publicly readable"
  on public.team_pledges for select
  using (true);

drop trigger if exists team_pledges_updated_at on public.team_pledges;
create trigger team_pledges_updated_at
  before update on public.team_pledges
  for each row execute function public.set_updated_at();
