import 'server-only';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import {
  confirmRegistration,
  createTicket,
  isWebhookProcessed,
  markWebhookProcessed,
  recordWebhookEvent,
} from '@/lib/db-admin';
import { SPECTATOR_TICKET, TEAMS, getTeamBySlug } from '@/lib/teams-config';

/**
 * Shopify webhook receiver for `orders/paid` events.
 *
 * Flow:
 *   1. Read raw body — critical: must NOT call req.json() first because
 *      HMAC is computed on the exact bytes Shopify sent.
 *   2. Verify HMAC against SHOPIFY_WEBHOOK_SECRET. Reject 401 if invalid.
 *   3. Check idempotency — if we've already processed this webhook ID, ack 200
 *      without re-processing.
 *   4. Parse the order JSON. Walk line_items. For each line item:
 *      - Team registration product → confirm the pending Supabase row,
 *        create 2 bundled-spectator tickets.
 *      - Spectator ticket product → create N paid-spectator tickets where
 *        N = line_item.quantity.
 *   5. Revalidate /teams and /teams/[slug] so the roster pages refresh.
 *   6. Mark webhook processed, ack 200.
 *
 * Shopify expects a 200 response within 5 seconds. If the handler is slow
 * (e.g. emailing tickets), Shopify retries with exponential backoff — the
 * idempotency check (step 3) ensures retries are safe.
 */

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

if (!SHOPIFY_WEBHOOK_SECRET) {
  // Don't throw at module load — the webhook route can render an
  // informative error response instead, and other routes can still work.
  // eslint-disable-next-line no-console
  console.warn(
    '[shopify-webhook] SHOPIFY_WEBHOOK_SECRET not set — all webhooks will be rejected'
  );
}

/** Constant-time HMAC verification. */
function verifyShopifyWebhook(
  rawBody: Buffer,
  hmacHeader: string | null,
  secret: string
): boolean {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ============================================================================
// Shopify order types (only the fields we use)
// ============================================================================

interface ShopifyLineItemProperty {
  name: string;
  value: string;
}

interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  title: string;
  quantity: number;
  properties?: ShopifyLineItemProperty[];
  price: string;
}

interface ShopifyNoteAttribute {
  name: string;
  value: string;
}

interface ShopifyOrder {
  id: number;
  name: string; // "#1001"
  email?: string;
  contact_email?: string;
  total_price?: string;
  line_items: ShopifyLineItem[];
  note_attributes?: ShopifyNoteAttribute[]; // these are our cart attributes
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

function getNoteAttribute(
  order: ShopifyOrder,
  key: string
): string | undefined {
  return order.note_attributes?.find((a) => a.name === key)?.value;
}

function getBuyerName(order: ShopifyOrder): string {
  const customerName = [
    order.customer?.first_name,
    order.customer?.last_name,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  // Prefer the player_full_name attribute (came from our form) since the
  // Shopify customer might be a parent buying for their child.
  return getNoteAttribute(order, 'player_full_name') || customerName || 'Guest';
}

function getBuyerEmail(order: ShopifyOrder): string {
  return order.email || order.contact_email || order.customer?.email || '';
}

// Team product IDs as a Set for quick lookup
const TEAM_PRODUCT_IDS = new Set(TEAMS.map((t) => t.shopifyProductId));
const SPECTATOR_PRODUCT_ID = SPECTATOR_TICKET.shopifyProductId;

// ============================================================================
// POST handler
// ============================================================================

export async function POST(req: Request) {
  if (!SHOPIFY_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'webhook-not-configured' },
      { status: 500 }
    );
  }

  // ---- Read raw body (must come BEFORE any json parsing) -----------------
  const rawBodyArrayBuffer = await req.arrayBuffer();
  const rawBody = Buffer.from(rawBodyArrayBuffer);

  // ---- Verify HMAC --------------------------------------------------------
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  const verified = verifyShopifyWebhook(rawBody, hmacHeader, SHOPIFY_WEBHOOK_SECRET);
  if (!verified) {
    // eslint-disable-next-line no-console
    console.warn('[shopify-webhook] HMAC verification failed', {
      hasHmac: Boolean(hmacHeader),
      bodyLength: rawBody.length,
    });
    return NextResponse.json({ error: 'invalid-signature' }, { status: 401 });
  }

  const topic = req.headers.get('x-shopify-topic') ?? '';
  const webhookId = req.headers.get('x-shopify-webhook-id') ?? '';
  const shopDomain = req.headers.get('x-shopify-shop-domain') ?? '';

  if (!webhookId) {
    // Shopify always sends this header. If it's missing, something is wrong
    // (test request? misconfigured proxy?). Reject.
    return NextResponse.json({ error: 'missing-webhook-id' }, { status: 400 });
  }

  // Only handle orders/paid — ignore anything else even if Shopify configured
  // additional topics to this endpoint by mistake.
  if (topic !== 'orders/paid') {
    return NextResponse.json(
      { ok: true, ignored: `unhandled topic: ${topic}` },
      { status: 200 }
    );
  }

  // ---- Idempotency --------------------------------------------------------
  if (await isWebhookProcessed(webhookId)) {
    return NextResponse.json(
      { ok: true, idempotent: true, webhookId },
      { status: 200 }
    );
  }

  // Record receipt before processing
  await recordWebhookEvent({ webhook_id: webhookId, topic });

  // ---- Parse order JSON ---------------------------------------------------
  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    await markWebhookProcessed(webhookId, 'invalid-json');
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  // eslint-disable-next-line no-console
  console.log('[shopify-webhook] processing', {
    webhookId,
    shopDomain,
    orderId: order.id,
    orderName: order.name,
    lineItemCount: order.line_items?.length ?? 0,
  });

  // ---- Process line items -------------------------------------------------
  const buyerName = getBuyerName(order);
  const buyerEmail = getBuyerEmail(order);
  const registrationId = getNoteAttribute(order, 'registration_id');
  const teamSlug = getNoteAttribute(order, 'team_slug');

  let registrationConfirmed = false;
  let bundledTicketsCreated = 0;
  let paidTicketsCreated = 0;
  const errors: string[] = [];

  for (const line of order.line_items ?? []) {
    const productId = String(line.product_id);

    // Team registration product
    if (TEAM_PRODUCT_IDS.has(productId)) {
      // Confirm the pending registration row
      if (registrationId && !registrationConfirmed) {
        const result = await confirmRegistration({
          registrationId,
          shopifyOrderId: String(order.id),
          shopifyOrderName: order.name,
          amountPaidCents: Math.round(
            parseFloat(order.total_price ?? '0') * 100
          ),
        });

        if (result.ok) {
          registrationConfirmed = true;
        } else if ('capExceeded' in result) {
          // Race past cap: the team filled while this buyer was in checkout.
          // We can't easily auto-refund via Storefront API (admin scope needed),
          // so we log the situation and let an admin handle it.
          errors.push(
            `cap-exceeded: order ${order.name} for team ${result.teamSlug} — manual refund needed`
          );
          // eslint-disable-next-line no-console
          console.error('[shopify-webhook] CAP EXCEEDED', {
            orderName: order.name,
            teamSlug: result.teamSlug,
            registrationId,
          });
        } else {
          errors.push(`confirm-registration: ${result.error}`);
        }
      } else if (!registrationId) {
        errors.push(`team-product-no-registration-id: line ${line.id}`);
      }

      // Create the 2 bundled spectator tickets (one per quantity unit)
      const ticketsToCreate = 2 * line.quantity;
      for (let i = 0; i < ticketsToCreate; i++) {
        const ticket = await createTicket({
          shopify_order_id: String(order.id),
          shopify_order_name: order.name,
          registration_id: registrationId ?? null,
          ticket_kind: 'bundled-spectator',
          buyer_name: buyerName,
          buyer_email: buyerEmail,
        });
        if (ticket.ok) {
          bundledTicketsCreated++;
        } else {
          errors.push(`create-bundled-ticket: ${ticket.error}`);
        }
      }
    }
    // Spectator ticket product
    else if (productId === SPECTATOR_PRODUCT_ID) {
      for (let i = 0; i < line.quantity; i++) {
        const ticket = await createTicket({
          shopify_order_id: String(order.id),
          shopify_order_name: order.name,
          registration_id: null,
          ticket_kind: 'paid-spectator',
          buyer_name: buyerName,
          buyer_email: buyerEmail,
        });
        if (ticket.ok) {
          paidTicketsCreated++;
        } else {
          errors.push(`create-paid-ticket: ${ticket.error}`);
        }
      }
    } else {
      // Order contains a product we don't recognize. Not an error per se
      // (the store could sell other products), just log it.
      // eslint-disable-next-line no-console
      console.log('[shopify-webhook] unknown product in order', {
        productId,
        title: line.title,
      });
    }
  }

  // ---- Revalidate roster pages -------------------------------------------
  if (registrationConfirmed) {
    revalidatePath('/teams');
    if (teamSlug && getTeamBySlug(teamSlug)) {
      revalidatePath(`/teams/${teamSlug}`);
    }
  }

  // ---- Acknowledge --------------------------------------------------------
  const errorSummary = errors.length > 0 ? errors.join('; ') : undefined;
  await markWebhookProcessed(webhookId, errorSummary);

  return NextResponse.json(
    {
      ok: true,
      orderId: order.id,
      registrationConfirmed,
      bundledTicketsCreated,
      paidTicketsCreated,
      errors: errors.length > 0 ? errors : undefined,
    },
    { status: 200 }
  );
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Webhooks use POST.' },
    { status: 405 }
  );
}
