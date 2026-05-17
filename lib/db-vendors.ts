import { createClient } from '@supabase/supabase-js';/**
 * Confirm a pending vendor row after Shopify reports the order as paid.
 *
 * Called from the shopify-webhook handler. Idempotent — if the row is already
 * confirmed (e.g. webhook retry), returns ok without re-updating.
 */
export async function confirmVendor(input: {
  vendorId: string;
  shopifyOrderId: string;
  shopifyOrderName: string;
  amountPaidCents: number;
}): Promise<
  | { ok: true }
  | { ok: false; capExceeded: true }
  | { ok: false; error: string }
> {
  const supabase = getAdminClient();

  // Read current state first — idempotency + cap recheck.
  const { data: existing, error: readErr } = await supabase
    .from('vendors')
    .select('id, payment_status')
    .eq('id', input.vendorId)
    .single();

  if (readErr || !existing) {
    return { ok: false, error: 'vendor-not-found' };
  }

  if (existing.payment_status === 'confirmed') {
    return { ok: true }; // already processed
  }

  // Cap recheck — count current confirmed rows
  const { count, error: countErr } = await supabase
    .from('vendors')
    .select('id', { count: 'exact', head: true })
    .eq('payment_status', 'confirmed');

  if (countErr) {
    return { ok: false, error: 'cap-check-failed' };
  }

  if ((count ?? 0) >= 20) {
    // 21st vendor slipped past Shopify's inventory cap (race condition).
    // Flag for manual refund — don't auto-confirm.
    return { ok: false, capExceeded: true };
  }

  const { error: updateErr } = await supabase
    .from('vendors')
    .update({
      payment_status: 'confirmed',
      shopify_order_id: input.shopifyOrderId,
      shopify_order_name: input.shopifyOrderName,
      amount_paid_cents: input.amountPaidCents,
      paid_at: new Date().toISOString(),
    })
    .eq('id', input.vendorId);

  if (updateErr) {
    // eslint-disable-next-line no-console
    console.error('[confirmVendor] update error', updateErr);
    return { ok: false, error: 'update-failed' };
  }

  return { ok: true };
}

/**
 * Server-side Supabase client (service_role key, full DB access).
 * NEVER import this from client components.
 */
function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase admin env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Get the live vendor spot count via the SECURITY DEFINER RPC.
 * Used by the public /vendor page to show "X of 20 spots remaining".
 */
export async function getVendorSpotCount(): Promise<{
  confirmed_count: number;
  total_spots: number;
  spots_remaining: number;
  is_full: boolean;
}> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('get_vendor_spot_count');
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[getVendorSpotCount] rpc error', error);
    return { confirmed_count: 0, total_spots: 20, spots_remaining: 20, is_full: false };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    confirmed_count: row?.confirmed_count ?? 0,
    total_spots: row?.total_spots ?? 20,
    spots_remaining: row?.spots_remaining ?? 20,
    is_full: row?.is_full ?? false,
  };
}

type CreatePendingVendorInput = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  product_description: string;
  website: string | null;
};

type CreatePendingVendorResult =
  | { ok: true; vendorId: string }
  | { ok: false; vendorsFull: true }
  | { ok: false; error: string };

/**
 * Atomically create a pending vendor registration row.
 *
 * Re-checks the 20-spot cap server-side (never trust the client). If full,
 * returns vendorsFull: true so the API route can surface a friendly error.
 *
 * The returned vendorId is embedded in the Shopify cart attributes so the
 * webhook handler can flip the row to 'confirmed' after payment.
 *
 * Pending rows that never get paid are swept by the cleanup cron after 2
 * hours (same job that sweeps stale team registrations).
 */
export async function createPendingVendor(
  input: CreatePendingVendorInput
): Promise<CreatePendingVendorResult> {
  const supabase = getAdminClient();

  // Cap recheck — count confirmed only, not pending.
  const { count, error: countError } = await supabase
    .from('vendors')
    .select('*', { count: 'exact', head: true })
    .eq('payment_status', 'confirmed');

  if (countError) {
    // eslint-disable-next-line no-console
    console.error('[createPendingVendor] count error', countError);
    return { ok: false, error: 'db-error' };
  }

  if ((count ?? 0) >= 20) {
    return { ok: false, vendorsFull: true };
  }

  const { data, error } = await supabase
    .from('vendors')
    .insert({
      company_name: input.company_name,
      contact_name: input.contact_name,
      email: input.email,
      phone: input.phone,
      product_description: input.product_description,
      website: input.website,
      payment_status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[createPendingVendor] insert error', error);
    return { ok: false, error: 'db-error' };
  }

  return { ok: true, vendorId: data.id };
}
