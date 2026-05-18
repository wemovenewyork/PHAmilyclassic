-- 1. Tighten tier_label so it can only hold valid tier strings,
--    and only when donation_type = 'tier'.
alter table public.donations
  add constraint donations_tier_label_values_chk
    check (tier_label is null or tier_label in ('25','50','100','250'));

alter table public.donations
  add constraint donations_tier_label_alignment_chk
    check ((donation_type = 'tier') = (tier_label is not null));

-- 2. Replace the broad RLS policy with a column-safe view.
--    The view exposes ONLY non-PII columns needed by the donor wall.
drop policy if exists "donor_wall_public_read" on public.donations;

-- Public is now blocked from reading the table directly.
-- Service role bypasses RLS (used by server routes), so nothing server-side breaks.

create or replace view public.donor_wall as
  select
    id,
    created_at,
    donor_first_name,
    public_message,
    tier_label
  from public.donations
  where payment_status = 'confirmed'
    and is_anonymous = false;

-- Lock down the view: anon and authenticated can SELECT; nothing else.
revoke all on public.donor_wall from public;
grant select on public.donor_wall to anon, authenticated;

-- Make the view run with the definer's privileges so RLS on the underlying
-- table doesn't block legitimate reads of the wall. The view's WHERE clause
-- is the actual gate.
alter view public.donor_wall set (security_invoker = false);

comment on view public.donor_wall is
  'Public-safe projection of confirmed, non-anonymous donations. No emails, no amounts, no shopify ids.';
