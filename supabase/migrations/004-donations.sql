create table public.donations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- donor (all optional)
  donor_first_name text,
  donor_email text,
  public_message text,
  is_anonymous boolean not null default false,

  -- amount
  amount_cents integer not null check (amount_cents >= 500 and amount_cents <= 500000),
  currency text not null default 'USD',
  donation_type text not null check (donation_type in ('tier', 'custom')),
  tier_label text, -- '25' | '50' | '100' | '250' when donation_type='tier'

  -- shopify linkage
  shopify_variant_id text,
  shopify_draft_order_id text,
  shopify_order_id text,
  shopify_checkout_url text,

  -- lifecycle
  payment_status text not null default 'pending'
    check (payment_status in ('pending','confirmed','failed','cancelled')),
  confirmed_at timestamptz
);

create index donations_payment_status_idx on public.donations (payment_status);
create index donations_created_at_idx on public.donations (created_at desc);
create index donations_donor_wall_idx
  on public.donations (created_at desc)
  where payment_status = 'confirmed' and is_anonymous = false;

-- RLS: public can SELECT only confirmed + non-anonymous (for the donor wall)
alter table public.donations enable row level security;

create policy "donor_wall_public_read" on public.donations
  for select using (payment_status = 'confirmed' and is_anonymous = false);

-- updated_at trigger — match the existing convention used by teams/vendors
create trigger set_donations_updated_at
  before update on public.donations
  for each row execute function public.set_updated_at();
