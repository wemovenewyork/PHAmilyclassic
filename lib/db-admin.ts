import 'server-only';
import { supabaseAdmin } from './supabase-admin';

// ============================================================================
// Admin / server-only writes — backed by the SERVICE_ROLE key.
// NEVER import this module from a client component.
// ============================================================================

export interface PendingRegistrationInput {
  team_id: string;
  full_name: string;
  email: string;
  phone: string;
  jersey_size: string;
  shorts_size: string;
  is_youth: boolean;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  guardian_email?: string | null;
  refund_acknowledged: boolean;
}

/**
 * Create a pending registration row. Performs a server-side cap check:
 * if the team is full at insert time, returns { ok: false, teamFull: true }
 * and does NOT create the row.
 *
 * Final cap enforcement happens at webhook time when payment status flips
 * to 'confirmed' — this guards against payment races.
 */
export async function createPendingRegistration(
  input: PendingRegistrationInput
): Promise<
  | { ok: true; registrationId: string }
  | { ok: false; teamFull: true }
  | { ok: false; error: string }
> {
  const { data: countRow, error: countErr } = await supabaseAdmin
    .from('team_roster_counts')
    .select('confirmed_count, max_roster, is_full')
    .eq('team_id', input.team_id)
    .single();

  if (countErr || !countRow) {
    return { ok: false, error: 'team-not-found' };
  }
  if (countRow.is_full) {
    return { ok: false, teamFull: true };
  }

  const { data, error } = await supabaseAdmin
    .from('registrations')
    .insert({
      team_id: input.team_id,
      full_name: input.full_name,
      email: input.email,
      phone: input.phone,
      jersey_size: input.jersey_size,
      shorts_size: input.shorts_size,
      is_youth: input.is_youth,
      guardian_name: input.guardian_name ?? null,
      guardian_phone: input.guardian_phone ?? null,
      guardian_email: input.guardian_email ?? null,
      refund_acknowledged: input.refund_acknowledged,
      payment_status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[createPendingRegistration] insert error', error);
    return { ok: false, error: error?.message ?? 'insert-failed' };
  }

  return { ok: true, registrationId: data.id };
}

/** Map a Shopify product GID back to a Supabase team row. */
export async function getTeamRowByProductGid(
  gid: string
): Promise<{ id: string; slug: string; max_roster: number; name: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, slug, max_roster, name')
    .eq('shopify_product_gid', gid)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Flip a registration from 'pending' to 'confirmed' after Shopify webhook
 * fires. Re-checks cap inside — if the team raced past cap during checkout,
 * returns { capExceeded: true } so the caller can issue a refund.
 *
 * Idempotent: if already confirmed, returns { ok: true } without re-updating.
 */
export async function confirmRegistration(args: {
  registrationId: string;
  shopifyOrderId: string;
  shopifyOrderName: string;
  amountPaidCents: number;
}): Promise<
  | { ok: true }
  | { ok: false; capExceeded: true; teamSlug: string }
  | { ok: false; error: string }
> {
  const { data: reg, error: regErr } = await supabaseAdmin
    .from('registrations')
    .select('id, team_id, payment_status')
    .eq('id', args.registrationId)
    .single();

  if (regErr || !reg) return { ok: false, error: 'registration-not-found' };
  if (reg.payment_status === 'confirmed') return { ok: true };

  const { data: countRow } = await supabaseAdmin
    .from('team_roster_counts')
    .select('confirmed_count, max_roster, team_slug')
    .eq('team_id', reg.team_id)
    .single();

  if (countRow && countRow.confirmed_count >= countRow.max_roster) {
    return { ok: false, capExceeded: true, teamSlug: countRow.team_slug };
  }

  const { error } = await supabaseAdmin
    .from('registrations')
    .update({
      payment_status: 'confirmed',
      shopify_order_id: args.shopifyOrderId,
      shopify_order_name: args.shopifyOrderName,
      amount_paid_cents: args.amountPaidCents,
      paid_at: new Date().toISOString(),
      sizes_locked_at: new Date().toISOString(),
    })
    .eq('id', args.registrationId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[confirmRegistration] update error', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Used by API routes to look up team UUID from slug. */
export async function getTeamRowBySlug(
  slug: string
): Promise<{ id: string; max_roster: number } | null> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, max_roster')
    .eq('slug', slug)
    .single();
  if (error || !data) return null;
  return data;
}

// ============================================================================
// Ticketing (custom QR system)
// ============================================================================

export interface CreateTicketInput {
  shopify_order_id: string;
  shopify_order_name: string;
  registration_id: string | null;
  ticket_kind: 'bundled-spectator' | 'paid-spectator';
  buyer_name: string;
  buyer_email: string;
}

/**
 * Generate a human-readable, unambiguous short code for a ticket.
 * Format: PHC-XXXX-YYYY (8 chars, Crockford base32 — no I/O/L/U to prevent
 * misreads). Collisions checked at insert time via the unique index.
 */
function generateShortCode(): string {
  // Crockford's base32: 0-9 + A-Z minus I, L, O, U
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const part = (len: number) =>
    Array.from(
      { length: len },
      () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    ).join('');
  return `PHC-${part(4)}-${part(4)}`;
}

/**
 * Create one ticket row. Retries on short_code collision (extremely unlikely
 * but theoretically possible).
 */
export async function createTicket(input: CreateTicketInput): Promise<
  | { ok: true; ticketId: string; shortCode: string }
  | { ok: false; error: string }
> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const shortCode = generateShortCode();
    const { data, error } = await supabaseAdmin
      .from('tickets')
      .insert({
        short_code: shortCode,
        shopify_order_id: input.shopify_order_id,
        shopify_order_name: input.shopify_order_name,
        registration_id: input.registration_id,
        ticket_kind: input.ticket_kind,
        buyer_name: input.buyer_name,
        buyer_email: input.buyer_email,
      })
      .select('id, short_code')
      .single();

    if (!error && data) {
      return { ok: true, ticketId: data.id, shortCode: data.short_code };
    }

    // Unique violation on short_code? Try again with a new code.
    if (error?.code === '23505' && error.message.includes('short_code')) {
      continue;
    }

    // eslint-disable-next-line no-console
    console.error('[createTicket] error', error);
    return { ok: false, error: error?.message ?? 'insert-failed' };
  }

  return { ok: false, error: 'short-code-collision-exhausted' };
}

/**
 * Have we already processed this webhook ID? Used for idempotency — Shopify
 * may retry deliveries up to 19 times over 48 hours, and we don't want to
 * double-create tickets if a successful response gets lost in transit.
 */
export async function isWebhookProcessed(webhookId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('webhook_events')
    .select('webhook_id, processed_ok')
    .eq('webhook_id', webhookId)
    .maybeSingle();
  return Boolean(data && data.processed_ok);
}

/**
 * Mark a webhook as received. Call this immediately on receipt, before
 * processing. If processing succeeds, call markWebhookProcessed afterward.
 *
 * If the row already exists (e.g. duplicate retry), this is a no-op due to
 * the primary key uniqueness — caller should handle the duplicate case via
 * isWebhookProcessed first.
 */
export async function recordWebhookEvent(args: {
  webhook_id: string;
  topic: string;
  shopify_order_id?: string;
  shopify_order_name?: string;
}): Promise<void> {
  await supabaseAdmin.from('webhook_events').upsert(
    {
      webhook_id: args.webhook_id,
      topic: args.topic,
      shopify_order_id: args.shopify_order_id ?? null,
      shopify_order_name: args.shopify_order_name ?? null,
      processed_ok: false,
    },
    { onConflict: 'webhook_id', ignoreDuplicates: true }
  );
}

export async function markWebhookProcessed(
  webhookId: string,
  errorMessage?: string
): Promise<void> {
  await supabaseAdmin
    .from('webhook_events')
    .update({
      processed_ok: !errorMessage,
      error_message: errorMessage ?? null,
    })
    .eq('webhook_id', webhookId);
}
