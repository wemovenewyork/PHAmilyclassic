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
// Scanner — admit + manual lookup + scan log
// ============================================================================

export type ScanLocation = 'main_gate' | 'after_party' | 'manual';
export type ScanSource = 'qr' | 'manual_lookup' | 'offline_admit';
export type ScanResult =
  | 'success'
  | 'already_used'
  | 'wrong_event'
  | 'refunded'
  | 'voided'
  | 'not_found';

export interface ScanAdmitInput {
  token: string;
  eventAtGate: TicketEvent;        // 'main_event' | 'after_party'
  scanner: string;
  source: ScanSource;              // 'qr' | 'manual_lookup'
  clientScanId?: string | null;    // optional idempotency key from offline queue
}

export interface ScanAdmitSuccess {
  result: 'success';
  ticket: {
    id: string;
    holder_name: string;
    holder_email: string;
    ticket_type: TicketType;
    event: TicketEvent;
    team_slug: string | null;
    age_group: 'adult' | 'youth' | null;
    guardian_name: string | null;
    shopify_order_number: string | null;
  };
}

export type ScanAdmitFailure =
  | { result: 'not_found' }
  | {
      result: 'already_used';
      ticket: {
        holder_name: string;
        ticket_type: TicketType;
        scanned_at: string | null;
        scanned_by: string | null;
      };
    }
  | {
      result: 'wrong_event';
      ticket: {
        holder_name: string;
        ticket_type: TicketType;
        event: TicketEvent;
      };
    }
  | {
      result: 'refunded';
      ticket: { holder_name: string; ticket_type: TicketType };
    }
  | {
      result: 'voided';
      ticket: {
        holder_name: string;
        ticket_type: TicketType;
        voided_reason: string | null;
      };
    };

export type ScanAdmitResult = ScanAdmitSuccess | ScanAdmitFailure;

/**
 * Atomically admit a ticket: flip status from 'issued' to 'scanned' iff it's
 * currently 'issued' AND its event matches the gate. We do the gate / status
 * check via a single conditional UPDATE so two near-simultaneous scans of
 * the same QR can't both succeed.
 *
 * Always writes to ticket_scan_log (success or failure) so we have a full
 * audit trail of every attempt at the gate.
 *
 * Idempotency: if clientScanId is provided and we've already logged a
 * SUCCESS for the same client_scan_id (we store it in the log's `notes`
 * field as `client_scan_id:<id>`), we return the cached success result
 * without writing again. Failures don't get cached — a failed scan today
 * may succeed later (e.g. the customer disputes a refund and the row gets
 * un-refunded by an admin).
 */
export async function scanTicketAdmit(
  input: ScanAdmitInput,
): Promise<ScanAdmitResult> {
  const scanLocation: ScanLocation =
    input.eventAtGate === 'after_party' ? 'after_party' : 'main_gate';

  // Idempotency check first
  if (input.clientScanId) {
    const cached = await findCachedScanByClientId(input.clientScanId);
    if (cached) return cached;
  }

  // Optimistic atomic admit: only the FIRST scanner to flip the status wins.
  const { data: admitted, error: admitErr } = await supabaseAdmin
    .from('tickets')
    .update({
      status: 'scanned',
      scanned_at: new Date().toISOString(),
      scanned_by: input.scanner,
      scan_location: scanLocation,
      scan_source: input.source,
    })
    .eq('token', input.token)
    .eq('status', 'issued')
    .eq('event', input.eventAtGate)
    .select(
      'id, holder_name, holder_email, ticket_type, event, team_slug, age_group, guardian_name, shopify_order_number',
    )
    .maybeSingle();

  if (admitErr) {
    // eslint-disable-next-line no-console
    console.error('[scanTicketAdmit] update error', admitErr);
    // Treat as not_found for the client (we don't have enough info to say
    // more), but log the DB error for ops.
    await writeScanLog({
      ticket_id: null,
      scanner: input.scanner,
      result: 'not_found',
      location: scanLocation,
      source: input.source,
      notes: noteFromClient(input.clientScanId, `db_error:${admitErr.message}`),
    });
    return { result: 'not_found' };
  }

  if (admitted) {
    await writeScanLog({
      ticket_id: admitted.id,
      scanner: input.scanner,
      result: 'success',
      location: scanLocation,
      source: input.source,
      notes: noteFromClient(input.clientScanId),
    });
    return {
      result: 'success',
      ticket: {
        id: admitted.id,
        holder_name: admitted.holder_name,
        holder_email: admitted.holder_email,
        ticket_type: admitted.ticket_type as TicketType,
        event: admitted.event as TicketEvent,
        team_slug: admitted.team_slug,
        age_group: admitted.age_group as 'adult' | 'youth' | null,
        guardian_name: admitted.guardian_name,
        shopify_order_number: admitted.shopify_order_number,
      },
    };
  }

  // Update affected zero rows — figure out why so we can return a useful
  // failure type.
  const { data: row } = await supabaseAdmin
    .from('tickets')
    .select(
      'id, status, event, holder_name, ticket_type, scanned_at, scanned_by, voided_reason',
    )
    .eq('token', input.token)
    .maybeSingle();

  if (!row) {
    await writeScanLog({
      ticket_id: null,
      scanner: input.scanner,
      result: 'not_found',
      location: scanLocation,
      source: input.source,
      notes: noteFromClient(input.clientScanId),
    });
    return { result: 'not_found' };
  }

  const baseTicketInfo = {
    holder_name: row.holder_name,
    ticket_type: row.ticket_type as TicketType,
  };

  if (row.status === 'scanned') {
    await writeScanLog({
      ticket_id: row.id,
      scanner: input.scanner,
      result: 'already_used',
      location: scanLocation,
      source: input.source,
      notes: noteFromClient(input.clientScanId),
    });
    return {
      result: 'already_used',
      ticket: {
        ...baseTicketInfo,
        scanned_at: row.scanned_at,
        scanned_by: row.scanned_by,
      },
    };
  }

  if (row.status === 'refunded') {
    await writeScanLog({
      ticket_id: row.id,
      scanner: input.scanner,
      result: 'refunded',
      location: scanLocation,
      source: input.source,
      notes: noteFromClient(input.clientScanId),
    });
    return { result: 'refunded', ticket: baseTicketInfo };
  }

  if (row.status === 'voided') {
    await writeScanLog({
      ticket_id: row.id,
      scanner: input.scanner,
      result: 'voided',
      location: scanLocation,
      source: input.source,
      notes: noteFromClient(input.clientScanId),
    });
    return {
      result: 'voided',
      ticket: { ...baseTicketInfo, voided_reason: row.voided_reason },
    };
  }

  // Status is 'issued' but the event didn't match — wrong gate.
  await writeScanLog({
    ticket_id: row.id,
    scanner: input.scanner,
    result: 'wrong_event',
    location: scanLocation,
    source: input.source,
    notes: noteFromClient(input.clientScanId),
  });
  return {
    result: 'wrong_event',
    ticket: { ...baseTicketInfo, event: row.event as TicketEvent },
  };
}

function noteFromClient(
  clientScanId: string | null | undefined,
  extra?: string,
): string | null {
  const parts: string[] = [];
  if (clientScanId) parts.push(`client_scan_id:${clientScanId}`);
  if (extra) parts.push(extra);
  return parts.length ? parts.join('; ') : null;
}

interface WriteScanLogInput {
  ticket_id: string | null;
  scanner: string;
  result: ScanResult;
  location: ScanLocation;
  source: ScanSource;
  notes: string | null;
}

async function writeScanLog(input: WriteScanLogInput): Promise<void> {
  const { error } = await supabaseAdmin.from('ticket_scan_log').insert({
    ticket_id: input.ticket_id,
    scanner: input.scanner,
    result: input.result,
    location: input.location,
    source: input.source,
    notes: input.notes,
  });
  if (error) {
    // Non-fatal — admit already succeeded/failed; logging is best-effort.
    // eslint-disable-next-line no-console
    console.error('[writeScanLog] insert error', error);
  }
}

async function findCachedScanByClientId(
  clientScanId: string,
): Promise<ScanAdmitSuccess | null> {
  // Find a prior SUCCESSFUL log entry with this client_scan_id, then
  // re-read the ticket to return current state.
  const { data: log } = await supabaseAdmin
    .from('ticket_scan_log')
    .select('ticket_id, result')
    .ilike('notes', `%client_scan_id:${clientScanId}%`)
    .eq('result', 'success')
    .maybeSingle();

  if (!log?.ticket_id) return null;

  const { data: ticket } = await supabaseAdmin
    .from('tickets')
    .select(
      'id, holder_name, holder_email, ticket_type, event, team_slug, age_group, guardian_name, shopify_order_number',
    )
    .eq('id', log.ticket_id)
    .maybeSingle();

  if (!ticket) return null;

  return {
    result: 'success',
    ticket: {
      id: ticket.id,
      holder_name: ticket.holder_name,
      holder_email: ticket.holder_email,
      ticket_type: ticket.ticket_type as TicketType,
      event: ticket.event as TicketEvent,
      team_slug: ticket.team_slug,
      age_group: ticket.age_group as 'adult' | 'youth' | null,
      guardian_name: ticket.guardian_name,
      shopify_order_number: ticket.shopify_order_number,
    },
  };
}

export interface LookupTicketResult {
  id: string;
  token: string;
  holder_name: string;
  holder_email: string;
  ticket_type: TicketType;
  event: TicketEvent;
  status: 'issued' | 'scanned' | 'voided' | 'refunded';
  shopify_order_number: string | null;
}

/**
 * Search tickets by partial name or email match, or exact Shopify order number.
 * Used by the manual-lookup sheet in the scanner UI. Returns up to `limit`
 * rows (default 10).
 */
export async function lookupTicketsForScanner(
  query: string,
  limit = 10,
): Promise<LookupTicketResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const wildcard = `%${trimmed}%`;
  // Pattern-quote nothing else — Supabase parameterizes the value.
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select(
      'id, token, holder_name, holder_email, ticket_type, event, status, shopify_order_number',
    )
    .or(
      `holder_name.ilike.${wildcard},holder_email.ilike.${wildcard},shopify_order_number.eq.${trimmed}`,
    )
    .limit(limit);

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[lookupTicketsForScanner] error', error);
    return [];
  }
  return data as LookupTicketResult[];
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

// ============================================================================
// Admin dashboard helpers (PR #20)
// ============================================================================
// All exports below assume the caller has already verified the admin session
// JWT and is passing a trusted `adminId` from the verified payload — never
// from client-supplied input. The audit log derives accountability from
// adminId, so callers MUST NOT take it from the request body.

import { randomUUID } from 'node:crypto';

export interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  last_login_at: string | null;
}

/** Case-insensitive lookup. Returns null when not found. */
export async function getAdminByEmail(email: string): Promise<AdminRow | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  const { data, error } = await supabaseAdmin
    .from('admins')
    .select('id, email, password_hash, display_name, last_login_at')
    .ilike('email', trimmed)
    .maybeSingle();
  if (error || !data) return null;
  return data as AdminRow;
}

export async function touchAdminLastLogin(adminId: string): Promise<void> {
  await supabaseAdmin
    .from('admins')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', adminId);
}

// ---- Audit log ----
export type AuditAction =
  | 'issued'
  | 'voided'
  | 'restored'
  | 'resent'
  | 'email_changed';

export interface AuditLogInput {
  ticketId: string;
  adminId: string;
  action: AuditAction;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const { error } = await supabaseAdmin.from('ticket_audit_log').insert({
    ticket_id: input.ticketId,
    admin_id: input.adminId,
    action: input.action,
    metadata: input.metadata ?? {},
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[writeAuditLog] error', error);
  }
}

export interface AuditLogEntry {
  id: string;
  ticket_id: string;
  admin_id: string;
  admin_display_name: string | null;
  action: AuditAction;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Per-ticket audit history, joined to admins for display name. */
export async function getAuditLogForTicket(
  ticketId: string,
): Promise<AuditLogEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('ticket_audit_log')
    .select('id, ticket_id, admin_id, action, metadata, created_at, admins(display_name)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[getAuditLogForTicket] error', error);
    return [];
  }
  return (data as unknown as Array<{
    id: string;
    ticket_id: string;
    admin_id: string;
    action: AuditAction;
    metadata: Record<string, unknown>;
    created_at: string;
    admins: { display_name: string } | { display_name: string }[] | null;
  }>).map((row) => {
    const adminRow = Array.isArray(row.admins) ? row.admins[0] : row.admins;
    return {
      id: row.id,
      ticket_id: row.ticket_id,
      admin_id: row.admin_id,
      admin_display_name: adminRow?.display_name ?? null,
      action: row.action,
      metadata: row.metadata,
      created_at: row.created_at,
    };
  });
}

// ---- Comp ticket issuance ----
export type CompEventSelection = 'main_event' | 'after_party' | 'combo';

export interface IssueCompInput {
  adminId: string;
  holderName: string;
  holderEmail: string;
  event: CompEventSelection;
  compReason: string;
  compNotes: string | null;
}

export interface IssueCompResult {
  shopifyOrderId: string;     // synthetic 'comp:<uuid>' for dispatch lookup
  ticketIds: string[];        // 1 row for main_event/after_party, 2 for combo
}

/**
 * Insert one or two comp ticket rows (combo = two) sharing a synthetic
 * shopify_order_id so the existing dispatchTicketEmailForOrder() path works
 * unchanged. Writes an `issued` audit log entry per row, populating
 * combo_sibling_ticket_id in the metadata when applicable.
 *
 * Does NOT send the email — caller invokes dispatchTicketEmailForOrder()
 * afterward with the returned shopifyOrderId.
 */
export async function issueCompTickets(
  input: IssueCompInput,
  generateToken: () => string,
): Promise<IssueCompResult> {
  const compGroupId = randomUUID();
  const shopifyOrderId = `comp:${compGroupId}`;

  // Per spec #3 mapping: 'combo' → two rows (main_event spectator + after_party).
  // Single-event comps → one row whose ticket_type is 'comp' and whose event is
  // the selected gate.
  const rows: Array<{
    token: string;
    event: 'main_event' | 'after_party';
  }> =
    input.event === 'combo'
      ? [
          { token: generateToken(), event: 'main_event' },
          { token: generateToken(), event: 'after_party' },
        ]
      : [{ token: generateToken(), event: input.event }];

  const insertPayload = rows.map((r) => ({
    token: r.token,
    shopify_order_id: shopifyOrderId,
    shopify_order_number: null,
    shopify_line_item_id: null,
    ticket_type: 'comp' as TicketType,
    event: r.event,
    holder_name: input.holderName,
    holder_email: input.holderEmail,
    holder_phone: null,
    team_slug: null,
    jersey_size: null,
    shorts_size: null,
    age_group: null,
    guardian_name: null,
    guardian_phone: null,
    comp_reason: input.compReason,
    comp_notes: input.compNotes,
  }));

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .insert(insertPayload)
    .select('id, event');

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[issueCompTickets] insert error', error);
    throw new Error(error?.message ?? 'Failed to insert comp tickets');
  }

  // Audit log per row, cross-linking siblings for combo issuance.
  for (const row of data) {
    const sibling = data.find((r) => r.id !== row.id)?.id ?? null;
    await writeAuditLog({
      ticketId: row.id,
      adminId: input.adminId,
      action: 'issued',
      metadata: {
        comp_reason: input.compReason,
        event: row.event,
        sent_to: input.holderEmail,
        ...(sibling ? { combo_sibling_ticket_id: sibling } : {}),
      },
    });
  }

  return {
    shopifyOrderId,
    ticketIds: data.map((r) => r.id),
  };
}

// ---- Void / Restore / Resend (admin actions on existing tickets) ----
export type AdminActionFailure =
  | 'not_found'
  | 'already_voided'
  | 'not_voided'
  | 'is_voided';

export type AdminActionResult<T> =
  | { ok: true; ticket: T }
  | { ok: false; error: AdminActionFailure };

/**
 * Soft-void a ticket. Already-scanned tickets are still voidable (admin can
 * still need to invalidate a scanned ticket in edge cases); the audit log
 * captures was_scanned for forensics. Refunded tickets are already
 * effectively voided; we treat re-voiding as already_voided for the admin UI.
 */
export async function voidTicket(args: {
  ticketId: string;
  adminId: string;
}): Promise<AdminActionResult<TicketRow>> {
  const { data: existing } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('id', args.ticketId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.status === 'voided') {
    return { ok: false, error: 'already_voided' };
  }
  const wasScanned = existing.status === 'scanned';
  const previousStatus = existing.status;

  const { data: updated, error } = await supabaseAdmin
    .from('tickets')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_by: args.adminId,
    })
    .eq('id', args.ticketId)
    .select('*')
    .single();
  if (error || !updated) {
    // eslint-disable-next-line no-console
    console.error('[voidTicket] update error', error);
    throw new Error(error?.message ?? 'Failed to void');
  }
  await writeAuditLog({
    ticketId: args.ticketId,
    adminId: args.adminId,
    action: 'voided',
    metadata: { previous_status: previousStatus, was_scanned: wasScanned },
  });
  return { ok: true, ticket: updated as TicketRow };
}

/**
 * Restore a voided OR refunded ticket back to 'issued'. Per spec #7,
 * Refunded behaves identically to Voided in the admin UI for action
 * availability, so both are restorable.
 */
export async function restoreTicket(args: {
  ticketId: string;
  adminId: string;
}): Promise<AdminActionResult<TicketRow>> {
  const { data: existing } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('id', args.ticketId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.status !== 'voided' && existing.status !== 'refunded') {
    return { ok: false, error: 'not_voided' };
  }
  const previousStatus = existing.status;
  const { data: updated, error } = await supabaseAdmin
    .from('tickets')
    .update({
      status: 'issued',
      voided_at: null,
      voided_by: null,
      voided_reason: null,
      // Clear scan state so a restored ticket can be admitted fresh.
      scanned_at: null,
      scanned_by: null,
      scan_location: null,
      scan_source: null,
    })
    .eq('id', args.ticketId)
    .select('*')
    .single();
  if (error || !updated) {
    // eslint-disable-next-line no-console
    console.error('[restoreTicket] update error', error);
    throw new Error(error?.message ?? 'Failed to restore');
  }
  await writeAuditLog({
    ticketId: args.ticketId,
    adminId: args.adminId,
    action: 'restored',
    metadata: { previous_status: previousStatus },
  });
  return { ok: true, ticket: updated as TicketRow };
}

/**
 * Update a ticket's holder_email (used by the Resend modal's email-override).
 * Writes an `email_changed` audit entry capturing both the previous and new
 * address. Does NOT send the email — the caller invokes the dispatch
 * afterward.
 */
export async function changeTicketEmail(args: {
  ticketId: string;
  adminId: string;
  newEmail: string;
}): Promise<AdminActionResult<TicketRow>> {
  const { data: existing } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('id', args.ticketId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.status === 'voided') return { ok: false, error: 'is_voided' };
  if (existing.holder_email === args.newEmail) {
    return { ok: true, ticket: existing as TicketRow };
  }
  const previousEmail = existing.holder_email;
  const { data: updated, error } = await supabaseAdmin
    .from('tickets')
    .update({ holder_email: args.newEmail })
    .eq('id', args.ticketId)
    .select('*')
    .single();
  if (error || !updated) {
    // eslint-disable-next-line no-console
    console.error('[changeTicketEmail] update error', error);
    throw new Error(error?.message ?? 'Failed to update email');
  }
  await writeAuditLog({
    ticketId: args.ticketId,
    adminId: args.adminId,
    action: 'email_changed',
    metadata: { previous_email: previousEmail, new_email: args.newEmail },
  });
  return { ok: true, ticket: updated as TicketRow };
}

export async function logTicketResent(args: {
  ticketId: string;
  adminId: string;
  sentTo: string;
}): Promise<void> {
  await writeAuditLog({
    ticketId: args.ticketId,
    adminId: args.adminId,
    action: 'resent',
    metadata: { sent_to: args.sentTo },
  });
}

// ---- Tickets search + filter (dashboard list) ----
export interface AdminTicketSearchInput {
  query?: string;
  paidCompFilter?: 'paid' | 'comp' | 'all';
  statusFilters?: Array<'issued' | 'voided' | 'scanned' | 'refunded'>;
  eventFilter?: 'main_event' | 'after_party' | 'combo' | 'all';
  cursor?: string | null;      // created_at ISO string of the last row from previous page
  limit?: number;
}

export interface AdminTicketSearchResult {
  tickets: TicketRow[];
  nextCursor: string | null;
}

export async function searchTicketsForAdmin(
  input: AdminTicketSearchInput,
): Promise<AdminTicketSearchResult> {
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));

  let q = supabaseAdmin.from('tickets').select('*');

  if (input.cursor) {
    // Cursor pagination on created_at descending — next page has older rows.
    q = q.lt('created_at', input.cursor);
  }

  if (input.paidCompFilter === 'comp') {
    q = q.eq('ticket_type', 'comp');
  } else if (input.paidCompFilter === 'paid') {
    q = q.neq('ticket_type', 'comp');
  }

  if (input.statusFilters && input.statusFilters.length > 0) {
    q = q.in('status', input.statusFilters);
  }

  if (input.eventFilter === 'main_event' || input.eventFilter === 'after_party') {
    q = q.eq('event', input.eventFilter);
  } else if (input.eventFilter === 'combo') {
    // "Combo" filter = shopify_order_id appears on >1 row in tickets. We
    // approximate by filtering to comp combo IDs (start with 'comp:') and
    // paid combos (orders with both events). For v1, surface only the
    // explicit comp-combo prefix — paid combos still surface via the
    // standalone event filters.
    q = q.like('shopify_order_id', 'comp:%');
  }

  if (input.query && input.query.trim().length >= 2) {
    const trimmed = input.query.trim();
    const wildcard = `%${trimmed}%`;
    q = q.or(
      [
        `holder_name.ilike.${wildcard}`,
        `holder_email.ilike.${wildcard}`,
        `shopify_order_number.ilike.${wildcard}`,
        `id.eq.${trimmed}`,
        `token.ilike.${wildcard}`,
      ].join(','),
    );
  }

  q = q.order('created_at', { ascending: false }).limit(limit + 1);

  const { data, error } = await q;
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[searchTicketsForAdmin] error', error);
    return { tickets: [], nextCursor: null };
  }
  const sliced = data.slice(0, limit) as TicketRow[];
  const nextCursor = data.length > limit ? sliced[sliced.length - 1].created_at : null;
  return { tickets: sliced, nextCursor };
}

// ---- Single-ticket fetch (for resend / void / restore endpoints) ----
export async function getTicketById(ticketId: string): Promise<TicketRow | null> {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TicketRow;
}

// ---- Dashboard stats ----
export interface AdminStats {
  main_event: { issued: number; scanned: number; voided: number; refunded: number };
  after_party: { issued: number; scanned: number; voided: number; refunded: number };
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('event, status');
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[getAdminStats] error', error);
    return {
      main_event: { issued: 0, scanned: 0, voided: 0, refunded: 0 },
      after_party: { issued: 0, scanned: 0, voided: 0, refunded: 0 },
    };
  }
  const out: AdminStats = {
    main_event: { issued: 0, scanned: 0, voided: 0, refunded: 0 },
    after_party: { issued: 0, scanned: 0, voided: 0, refunded: 0 },
  };
  for (const row of data as Array<{ event: string; status: string }>) {
    const bucket =
      row.event === 'after_party' ? out.after_party : out.main_event;
    if (row.status === 'issued') bucket.issued++;
    else if (row.status === 'scanned') bucket.scanned++;
    else if (row.status === 'voided') bucket.voided++;
    else if (row.status === 'refunded') bucket.refunded++;
  }
  return out;
}

// ---- Scan log feed (admin dashboard) ----
export interface ScanLogEntryForAdmin {
  id: string;
  attempted_at: string;
  ticket_id: string | null;
  holder_name: string | null;
  event: 'main_event' | 'after_party' | null;
  result: ScanResult;
  location: ScanLocation | null;
  source: ScanSource | null;
  scanner: string;
}

export interface ScanLogQuery {
  resultFilter?: ScanResult | null;
  cursor?: string | null;
  limit?: number;
}

export interface ScanLogQueryResult {
  entries: ScanLogEntryForAdmin[];
  nextCursor: string | null;
}

export async function getScanLogForAdmin(
  q: ScanLogQuery,
): Promise<ScanLogQueryResult> {
  const limit = Math.max(1, Math.min(200, q.limit ?? 50));
  let query = supabaseAdmin
    .from('ticket_scan_log')
    .select(
      'id, attempted_at, ticket_id, result, location, source, scanner, tickets(holder_name, event)',
    );

  if (q.cursor) {
    query = query.lt('attempted_at', q.cursor);
  }
  if (q.resultFilter) {
    query = query.eq('result', q.resultFilter);
  }
  query = query.order('attempted_at', { ascending: false }).limit(limit + 1);

  const { data, error } = await query;
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[getScanLogForAdmin] error', error);
    return { entries: [], nextCursor: null };
  }
  const rows = data as unknown as Array<{
    id: string;
    attempted_at: string;
    ticket_id: string | null;
    result: ScanResult;
    location: ScanLocation | null;
    source: ScanSource | null;
    scanner: string;
    tickets:
      | { holder_name: string; event: 'main_event' | 'after_party' }
      | Array<{ holder_name: string; event: 'main_event' | 'after_party' }>
      | null;
  }>;

  const mapped: ScanLogEntryForAdmin[] = rows.slice(0, limit).map((r) => {
    const ticketRow = Array.isArray(r.tickets) ? r.tickets[0] : r.tickets;
    return {
      id: r.id,
      attempted_at: r.attempted_at,
      ticket_id: r.ticket_id,
      holder_name: ticketRow?.holder_name ?? null,
      event: ticketRow?.event ?? null,
      result: r.result,
      location: r.location,
      source: r.source,
      scanner: r.scanner,
    };
  });

  const nextCursor =
    rows.length > limit ? mapped[mapped.length - 1].attempted_at : null;
  return { entries: mapped, nextCursor };
}
