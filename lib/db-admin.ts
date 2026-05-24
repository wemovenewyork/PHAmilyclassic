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
// Ticketing (custom QR system) — see supabase/migrations/006-tickets-redesign.sql
// ============================================================================

export type TicketType =
  | 'team_registration'
  | 'spectator'
  | 'after_party'
  | 'comp';

export type TicketEvent = 'main_event' | 'after_party';

export interface CreateTicketInput {
  /** 32-byte URL-safe base64 token (from lib/ticket-tokens.ts) */
  token: string;
  shopify_order_id: string;
  shopify_order_number?: string | null;
  shopify_line_item_id?: string | null;
  ticket_type: TicketType;
  event: TicketEvent;
  holder_name: string;
  holder_email: string;
  holder_phone?: string | null;
  // Team-registration metadata (null for non-team tickets)
  team_slug?: string | null;
  jersey_size?: string | null;
  shorts_size?: string | null;
  age_group?: 'adult' | 'youth' | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
}

/**
 * Insert one ticket row. The `token` should already be generated by the
 * caller (lib/ticket-tokens.ts uses 32 bytes of entropy → effectively
 * collision-free) so this function does NOT retry — a unique-violation
 * indicates a bug, not a collision.
 */
export async function createTicket(
  input: CreateTicketInput,
): Promise<{ ok: true; ticketId: string } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .insert({
      token: input.token,
      shopify_order_id: input.shopify_order_id,
      shopify_order_number: input.shopify_order_number ?? null,
      shopify_line_item_id: input.shopify_line_item_id ?? null,
      ticket_type: input.ticket_type,
      event: input.event,
      holder_name: input.holder_name,
      holder_email: input.holder_email,
      holder_phone: input.holder_phone ?? null,
      team_slug: input.team_slug ?? null,
      jersey_size: input.jersey_size ?? null,
      shorts_size: input.shorts_size ?? null,
      age_group: input.age_group ?? null,
      guardian_name: input.guardian_name ?? null,
      guardian_phone: input.guardian_phone ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[createTicket] error', error);
    return { ok: false, error: error?.message ?? 'insert-failed' };
  }
  return { ok: true, ticketId: data.id };
}

export interface TicketRow {
  id: string;
  token: string;
  shopify_order_id: string;
  shopify_order_number: string | null;
  shopify_line_item_id: string | null;
  ticket_type: TicketType;
  event: TicketEvent;
  status: 'issued' | 'scanned' | 'voided' | 'refunded';
  holder_name: string;
  holder_email: string;
  holder_phone: string | null;
  team_slug: string | null;
  jersey_size: string | null;
  shorts_size: string | null;
  age_group: 'adult' | 'youth' | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  scanned_at: string | null;
  scanned_by: string | null;
  scan_location: string | null;
  scan_source: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  voided_reason: string | null;
  email_sent_at: string | null;
  resend_email_id: string | null;
}

/** All tickets for a Shopify order, oldest first (insertion order). */
export async function getTicketsByOrderId(
  shopifyOrderId: string,
): Promise<TicketRow[]> {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('shopify_order_id', shopifyOrderId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[getTicketsByOrderId] error', error);
    return [];
  }
  return data as TicketRow[];
}

/** Single-ticket lookup by token (used by the hosted ticket page). */
export async function getTicketByToken(token: string): Promise<TicketRow | null> {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return null;
  return data as TicketRow;
}

/**
 * Mark a batch of tickets as having had their confirmation email sent.
 * resend_email_id lets the admin look the message up in Resend's dashboard
 * for deliverability tracking.
 */
export async function markTicketsEmailSent(
  ticketIds: string[],
  resendEmailId: string,
): Promise<void> {
  if (ticketIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from('tickets')
    .update({
      email_sent_at: new Date().toISOString(),
      resend_email_id: resendEmailId,
    })
    .in('id', ticketIds);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[markTicketsEmailSent] error', error);
  }
}

// ============================================================================
// Registration lookup (used by webhook to populate team-registration tickets)
// ============================================================================

export interface RegistrationDetails {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  jersey_size: string;
  shorts_size: string;
  is_youth: boolean;
  guardian_name: string | null;
  guardian_phone: string | null;
  team_slug: string;
  team_name: string;
}

/**
 * Fetch a registration row + joined team slug/name. Used by the webhook to
 * populate the team_registration ticket with player details and team info.
 */
export async function getRegistrationById(
  registrationId: string,
): Promise<RegistrationDetails | null> {
  const { data, error } = await supabaseAdmin
    .from('registrations')
    .select(
      'id, full_name, email, phone, jersey_size, shorts_size, is_youth, guardian_name, guardian_phone, teams(slug, name)',
    )
    .eq('id', registrationId)
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[getRegistrationById] error', error);
    return null;
  }

  // Supabase nested select returns the joined row as either an object or an
  // array depending on the relationship; tolerate both. Go through unknown
  // to bypass the inferred-array-shape mismatch.
  const rawTeams = (data as unknown as { teams: unknown }).teams;
  const teamRow = (
    Array.isArray(rawTeams) ? rawTeams[0] ?? null : rawTeams
  ) as { slug: string; name: string } | null;

  if (!teamRow) return null;

  return {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
    phone: data.phone,
    jersey_size: data.jersey_size,
    shorts_size: data.shorts_size,
    is_youth: data.is_youth,
    guardian_name: data.guardian_name ?? null,
    guardian_phone: data.guardian_phone ?? null,
    team_slug: teamRow.slug,
    team_name: teamRow.name,
  };
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
