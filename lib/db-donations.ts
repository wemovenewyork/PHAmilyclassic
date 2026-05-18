import 'server-only';
import { supabaseAdmin } from './supabase-admin';
import type { DonationInput } from './donations-schema';
import { resolveDonationUsd } from './donations-schema';

/**
 * Database helpers for the donations table.
 *
 * All functions use the service-role Supabase client (`supabaseAdmin`).
 * RLS is bypassed by design — these are only ever called from server
 * routes (api/donate, api/shopify-webhook). The `import 'server-only'`
 * above is a build-time guard against accidental client imports.
 *
 * Return shape: discriminated `{ ok: true; ... } | { ok: false; error: string }`
 * — matches the convention in lib/db-admin.ts. Never throws; defensive
 * try/catch wraps Supabase calls to catch rare JS-level errors.
 *
 * The public `donor_wall` view exists as defense-in-depth for any future
 * anon-key read path, but this module reads the underlying table directly
 * via the service role.
 */

export type DonationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  donor_first_name: string | null;
  donor_email: string | null;
  public_message: string | null;
  is_anonymous: boolean;
  amount_cents: number;
  currency: string;
  donation_type: 'tier' | 'custom';
  tier_label: string | null;
  shopify_variant_id: string | null;
  shopify_draft_order_id: string | null;
  shopify_order_id: string | null;
  shopify_checkout_url: string | null;
  payment_status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
  confirmed_at: string | null;
};

export type DonorWallEntry = {
  id: string;
  created_at: string;
  donor_first_name: string | null;
  public_message: string | null;
};

/**
 * Inserts a pending donation row. Returns the row (including its generated id).
 * On insert failure, returns `{ ok: false, error }` — caller (the API route)
 * should respond 500 and surface a generic error to the client.
 */
export async function insertPendingDonation(
  input: DonationInput
): Promise<
  | { ok: true; donation: DonationRow }
  | { ok: false; error: string }
> {
  try {
    const amount_cents = resolveDonationUsd(input) * 100;

    const row = {
      donor_first_name: input.donor_first_name ?? null,
      donor_email: input.donor_email ?? null,
      public_message: input.public_message ?? null,
      is_anonymous: input.is_anonymous,
      amount_cents,
      currency: 'USD',
      donation_type: input.donation_type,
      tier_label: input.donation_type === 'tier' ? input.tier_amount : null,
      payment_status: 'pending' as const,
    };

    const { data, error } = await supabaseAdmin
      .from('donations')
      .insert(row)
      .select('*')
      .single();

    if (error || !data) {
      // eslint-disable-next-line no-console
      console.error('[insertPendingDonation] insert error', error);
      return { ok: false, error: error?.message ?? 'donations.insert.unknown' };
    }

    return { ok: true, donation: data as DonationRow };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[insertPendingDonation] exception', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'donations.insert.unknown',
    };
  }
}

/**
 * Attaches Shopify identifiers to a pending donation after the cart or
 * draft order has been created. Best-effort: a failure here doesn't
 * roll back the user's checkout, but is logged by the caller.
 */
export async function attachShopifyToDonation(
  id: string,
  fields: {
    shopify_variant_id?: string | null;
    shopify_draft_order_id?: string | null;
    shopify_checkout_url?: string | null;
  },
): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  try {
    const { error } = await supabaseAdmin
      .from('donations')
      .update(fields)
      .eq('id', id);

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[attachShopifyToDonation] update error', error);
      return { ok: false, error: error.message ?? 'donations.update.unknown' };
    }

    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[attachShopifyToDonation] exception', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'donations.update.unknown',
    };
  }
}

/**
 * Marks a donation pending → failed. Called when cart/draft order creation
 * fails after the row has been inserted. Idempotent.
 */
export async function markDonationFailed(
  id: string
): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  try {
    const { error } = await supabaseAdmin
      .from('donations')
      .update({ payment_status: 'failed' })
      .eq('id', id)
      .eq('payment_status', 'pending'); // don't clobber a confirmed row

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[markDonationFailed] update error', error);
      return { ok: false, error: error.message ?? 'donations.markFailed.unknown' };
    }

    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[markDonationFailed] exception', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'donations.markFailed.unknown',
    };
  }
}

/**
 * Confirms a donation from the Shopify webhook handler.
 *
 * Resolution order:
 *  1. `donation_id` from cart/order note attribute (most reliable — set by us on cart create)
 *  2. `shopify_draft_order_id` (custom-amount path fallback)
 *
 * Returns the number of rows updated (0 or 1) via `updatedCount`. Caller
 * should log if 0 — means we got a donation-product order we can't tie to
 * a pending row.
 */
export async function confirmDonationByShopifyOrder(opts: {
  shopify_order_id: string;
  donation_id?: string | null;
  shopify_draft_order_id?: string | null;
}): Promise<
  | { ok: true; updatedCount: number }
  | { ok: false; error: string }
> {
  if (!opts.donation_id && !opts.shopify_draft_order_id) {
    return { ok: false, error: 'donations.confirm.missing-identifier' };
  }

  try {
    const update = {
      payment_status: 'confirmed' as const,
      confirmed_at: new Date().toISOString(),
      shopify_order_id: opts.shopify_order_id,
    };

    let query = supabaseAdmin.from('donations').update(update);
    if (opts.donation_id) {
      query = query.eq('id', opts.donation_id);
    } else if (opts.shopify_draft_order_id) {
      query = query.eq('shopify_draft_order_id', opts.shopify_draft_order_id);
    }
    // Only confirm pending rows — never re-confirm.
    query = query.eq('payment_status', 'pending');

    const { data, error } = await query.select('id');

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[confirmDonationByShopifyOrder] update error', error);
      return { ok: false, error: error.message ?? 'donations.confirm.unknown' };
    }

    return { ok: true, updatedCount: data?.length ?? 0 };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[confirmDonationByShopifyOrder] exception', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'donations.confirm.unknown',
    };
  }
}

/**
 * Returns confirmed, non-anonymous donations for the public donor wall.
 * Reads via service role from the underlying table; the `donor_wall` view
 * is defense-in-depth, not the read path here.
 *
 * Does NOT return email, amount, or shopify ids — only what the UI renders.
 */
export async function listDonorWall(
  limit = 100
): Promise<
  | { ok: true; entries: DonorWallEntry[] }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabaseAdmin
      .from('donations')
      .select('id, created_at, donor_first_name, public_message')
      .eq('payment_status', 'confirmed')
      .eq('is_anonymous', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[listDonorWall] select error', error);
      return { ok: false, error: error.message ?? 'donations.list.unknown' };
    }

    return { ok: true, entries: (data ?? []) as DonorWallEntry[] };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[listDonorWall] exception', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'donations.list.unknown',
    };
  }
}
