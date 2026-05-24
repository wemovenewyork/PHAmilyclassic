import 'server-only';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import {
  confirmRegistration,
  createTicket,
  getRegistrationById,
  getTicketsByOrderId,
  isWebhookProcessed,
  markTicketsEmailSent,
  markWebhookProcessed,
  recordWebhookEvent,
  type TicketRow,
} from '@/lib/db-admin';
import { confirmVendor } from '@/lib/db-vendors';
import { confirmDonationByShopifyOrder } from '@/lib/db-donations';
import {
  AFTER_PARTY_TICKET,
  COMBO_TICKET,
  SPECTATOR_TICKET,
  TEAMS,
  getTeamBySlug,
} from '@/lib/teams-config';
import { generateTicketToken } from '@/lib/ticket-tokens';
import { generateQRDataUrl } from '@/lib/qr';
import { generateTicketPDF } from '@/lib/ticket-pdf';
import { renderTicketEmail } from '@/lib/ticket-email';
import { sendEmail } from '@/lib/email';

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
 *        create 1 team_registration ticket (player) + 2 spectator tickets
 *        per quantity (event: main_event).
 *      - After-party product → create N after_party tickets where
 *        N = line_item.quantity (event: after_party).
 *      - Spectator ticket product → create N spectator tickets (event:
 *        main_event).
 *   5. If any tickets were created for this order, query them back, build
 *      a PDF + email with inline QR codes, send via Resend, and stamp
 *      tickets with email_sent_at + resend_email_id.
 *   6. Revalidate /teams and /teams/[slug] so the roster pages refresh.
 *   7. Mark webhook processed, ack 200.
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
  // Set when the order was created from an Admin draft order (custom-amount
  // donation path). source_name === 'draft_order' and source_identifier
  // holds the draft order's numeric id (NOT the GID — webhooks use REST format).
  source_name?: string;
  source_identifier?: string | null;
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
const AFTER_PARTY_PRODUCT_ID = AFTER_PARTY_TICKET.shopifyProductId;
const COMBO_PRODUCT_ID = COMBO_TICKET.shopifyProductId;
const VENDOR_PRODUCT_ID = '10440053784757';

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
  const buyerFirstName = order.customer?.first_name ?? '';
  const registrationId = getNoteAttribute(order, 'registration_id');
  const teamSlug = getNoteAttribute(order, 'team_slug');
  const vendorId = getNoteAttribute(order, 'vendor_id');

  let registrationConfirmed = false;
  let teamRegTicketsCreated = 0;
  let spectatorTicketsCreated = 0;
  let afterPartyTicketsCreated = 0;
  let donationConfirmed = false;
  const createdTicketIds: string[] = [];
  const errors: string[] = [];

  for (const line of order.line_items ?? []) {
    const productId = String(line.product_id);
    const lineItemId = String(line.id);

    // ---- Team registration product ----
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

      // Generate tickets:
      //   1 team_registration ticket per quantity (holder = the player)
      //   2 spectator tickets per quantity (holder = the buyer)
      // Both event: 'main_event'.
      const regDetails = registrationId
        ? await getRegistrationById(registrationId)
        : null;

      for (let q = 0; q < line.quantity; q++) {
        if (regDetails) {
          const teamTicket = await createTicket({
            token: generateTicketToken(),
            shopify_order_id: String(order.id),
            shopify_order_number: order.name,
            shopify_line_item_id: lineItemId,
            ticket_type: 'team_registration',
            event: 'main_event',
            holder_name: regDetails.full_name,
            holder_email: regDetails.email,
            holder_phone: regDetails.phone,
            team_slug: regDetails.team_slug,
            jersey_size: regDetails.jersey_size,
            shorts_size: regDetails.shorts_size,
            age_group: regDetails.is_youth ? 'youth' : 'adult',
            guardian_name: regDetails.guardian_name,
            guardian_phone: regDetails.guardian_phone,
          });
          if (teamTicket.ok) {
            createdTicketIds.push(teamTicket.ticketId);
            teamRegTicketsCreated++;
          } else {
            errors.push(`create-team-ticket: ${teamTicket.error}`);
          }
        } else {
          errors.push(
            `team-reg-details-unavailable: order ${order.name} line ${lineItemId}`
          );
        }

        for (let s = 0; s < 2; s++) {
          const specTicket = await createTicket({
            token: generateTicketToken(),
            shopify_order_id: String(order.id),
            shopify_order_number: order.name,
            shopify_line_item_id: lineItemId,
            ticket_type: 'spectator',
            event: 'main_event',
            holder_name: buyerName,
            holder_email: buyerEmail,
          });
          if (specTicket.ok) {
            createdTicketIds.push(specTicket.ticketId);
            spectatorTicketsCreated++;
          } else {
            errors.push(`create-spectator-bundled: ${specTicket.error}`);
          }
        }
      }
    }
    // ---- Vendor package product ----
    else if (productId === VENDOR_PRODUCT_ID) {
      if (vendorId) {
        const result = await confirmVendor({
          vendorId,
          shopifyOrderId: String(order.id),
          shopifyOrderName: order.name,
          amountPaidCents: Math.round(
            parseFloat(order.total_price ?? '0') * 100
          ),
        });

        if (!result.ok) {
          if ('capExceeded' in result) {
            errors.push(
              `vendor-cap-exceeded: order ${order.name} — manual refund needed`
            );
            // eslint-disable-next-line no-console
            console.error('[shopify-webhook] VENDOR CAP EXCEEDED', {
              orderName: order.name,
              vendorId,
            });
          } else {
            errors.push(`confirm-vendor: ${result.error}`);
          }
        }
      } else {
        errors.push(`vendor-product-no-vendor-id: line ${line.id}`);
      }
    }
    // ---- Combo product (1 spectator main_event + 1 after_party per qty) ----
    else if (productId === COMBO_PRODUCT_ID) {
      for (let q = 0; q < line.quantity; q++) {
        const spectatorTicket = await createTicket({
          token: generateTicketToken(),
          shopify_order_id: String(order.id),
          shopify_order_number: order.name,
          shopify_line_item_id: lineItemId,
          ticket_type: 'spectator',
          event: 'main_event',
          holder_name: buyerName,
          holder_email: buyerEmail,
        });
        if (spectatorTicket.ok) {
          createdTicketIds.push(spectatorTicket.ticketId);
          spectatorTicketsCreated++;
        } else {
          errors.push(`create-combo-spectator: ${spectatorTicket.error}`);
        }

        const afterPartyTicket = await createTicket({
          token: generateTicketToken(),
          shopify_order_id: String(order.id),
          shopify_order_number: order.name,
          shopify_line_item_id: lineItemId,
          ticket_type: 'after_party',
          event: 'after_party',
          holder_name: buyerName,
          holder_email: buyerEmail,
        });
        if (afterPartyTicket.ok) {
          createdTicketIds.push(afterPartyTicket.ticketId);
          afterPartyTicketsCreated++;
        } else {
          errors.push(`create-combo-after-party: ${afterPartyTicket.error}`);
        }
      }
    }
    // ---- After-party ticket product ----
    else if (productId === AFTER_PARTY_PRODUCT_ID) {
      for (let q = 0; q < line.quantity; q++) {
        const ticket = await createTicket({
          token: generateTicketToken(),
          shopify_order_id: String(order.id),
          shopify_order_number: order.name,
          shopify_line_item_id: lineItemId,
          ticket_type: 'after_party',
          event: 'after_party',
          holder_name: buyerName,
          holder_email: buyerEmail,
        });
        if (ticket.ok) {
          createdTicketIds.push(ticket.ticketId);
          afterPartyTicketsCreated++;
        } else {
          errors.push(`create-after-party-ticket: ${ticket.error}`);
        }
      }
    }
    // ---- Standalone spectator ticket product ----
    else if (productId === SPECTATOR_PRODUCT_ID) {
      for (let q = 0; q < line.quantity; q++) {
        const ticket = await createTicket({
          token: generateTicketToken(),
          shopify_order_id: String(order.id),
          shopify_order_number: order.name,
          shopify_line_item_id: lineItemId,
          ticket_type: 'spectator',
          event: 'main_event',
          holder_name: buyerName,
          holder_email: buyerEmail,
        });
        if (ticket.ok) {
          createdTicketIds.push(ticket.ticketId);
          spectatorTicketsCreated++;
        } else {
          errors.push(`create-spectator-standalone: ${ticket.error}`);
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

  // ---- Email dispatch (post-loop) -----------------------------------------
  // If any tickets were created for this order, query them back, build a
  // PDF + email, send via Resend, and stamp the rows with email_sent_at
  // + resend_email_id. Failures here don't fail the webhook — leaving
  // email_sent_at NULL lets an admin retry later.
  let emailSent = false;
  if (createdTicketIds.length > 0 && buyerEmail) {
    try {
      emailSent = await dispatchTicketEmail({
        shopifyOrderId: String(order.id),
        buyerEmail,
        buyerFirstName,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[shopify-webhook] dispatch-ticket-email threw', err);
      errors.push(
        `dispatch-ticket-email: ${err instanceof Error ? err.message : 'unknown'}`
      );
    }
  }

  // ---- Donation confirmation (post-loop dispatch) ------------------------
  // Tier and custom donations both set `donation_id` as a cart attribute when
  // the route creates the Shopify cart / draft order (Step 5). We dispatch
  // OFF the cart attribute, not off product_id, because custom-amount draft
  // orders carry product-less line items (no product_id to match on).
  //
  // shopify_draft_order_id is a fallback resolver: if the cart attribute
  // somehow doesn't propagate, we can still match the order to a pending row
  // via the draft order id. donation_id remains the primary key.
  // Note: webhook source_identifier is a numeric id; the donations table
  // stores GIDs (from Admin GraphQL), so we reconstruct the GID here.
  //
  // confirmDonationByShopifyOrder is idempotent on payment_status='pending',
  // so retries / replays are no-ops.
  const donationId = getNoteAttribute(order, 'donation_id');
  const draftOrderId =
    order.source_name === 'draft_order' && order.source_identifier
      ? `gid://shopify/DraftOrder/${order.source_identifier}`
      : null;

  if (donationId || draftOrderId) {
    try {
      const result = await confirmDonationByShopifyOrder({
        shopify_order_id: String(order.id),
        donation_id: donationId ?? null,
        shopify_draft_order_id: draftOrderId,
      });

      if (!result.ok) {
        errors.push(`confirm-donation: ${result.error}`);
      } else if (result.updatedCount === 0) {
        // No matching pending row. Two likely causes:
        //   (a) idempotent replay — already confirmed on a prior delivery
        //   (b) genuine anomaly — donation_id set but no pending row exists
        // Can't distinguish without an extra query. Default to silent and
        // log via console.warn for human reconciliation. Replay is the more
        // likely cause; the anomaly case is recoverable from the Shopify
        // order itself if a human notices.
        // eslint-disable-next-line no-console
        console.warn('[shopify-webhook] donation confirm matched 0 rows', {
          orderName: order.name,
          donationId: donationId ?? null,
          draftOrderId,
        });
      } else {
        donationConfirmed = true;
      }
    } catch (err) {
      // Defensive: confirmDonationByShopifyOrder has internal try/catch and
      // shouldn't throw, but if it does, treat it like any other branch error.
      // eslint-disable-next-line no-console
      console.error('[shopify-webhook] confirm-donation threw', err);
      errors.push(
        `confirm-donation: ${err instanceof Error ? err.message : 'unknown'}`
      );
    }
  }

  // ---- Revalidate roster pages -------------------------------------------
  if (registrationConfirmed) {
    revalidatePath('/teams');
    if (teamSlug && getTeamBySlug(teamSlug)) {
      revalidatePath(`/teams/${teamSlug}`);
    }
  }
  if (donationConfirmed) {
    revalidatePath('/donate');
  }

  // ---- Acknowledge --------------------------------------------------------
  const errorSummary = errors.length > 0 ? errors.join('; ') : undefined;
  await markWebhookProcessed(webhookId, errorSummary);

  return NextResponse.json(
    {
      ok: true,
      orderId: order.id,
      registrationConfirmed,
      teamRegTicketsCreated,
      spectatorTicketsCreated,
      afterPartyTicketsCreated,
      emailSent,
      donationConfirmed,
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

// ============================================================================
// Email dispatch helper
// ============================================================================

/**
 * Query all tickets for the order, render the PDF + email, send via Resend,
 * and stamp the tickets with email_sent_at + resend_email_id.
 *
 * Returns true if the email was sent successfully. Throws on transient
 * failures so the caller can capture them in the response errors list.
 */
async function dispatchTicketEmail(args: {
  shopifyOrderId: string;
  buyerEmail: string;
  buyerFirstName: string;
}): Promise<boolean> {
  const tickets = await getTicketsByOrderId(args.shopifyOrderId);
  if (tickets.length === 0) return false;

  // Pre-generate QR data URLs for inline embedding in the email HTML.
  const qrDataUrls = await Promise.all(
    tickets.map((t) => generateQRDataUrl(t.token, { size: 480, margin: 1 })),
  );

  // Email payload
  const emailTickets = tickets.map((t, i) => ({
    token: t.token,
    ticket_type: t.ticket_type,
    event: t.event,
    holder_name: t.holder_name,
    team_slug: t.team_slug,
    jersey_size: t.jersey_size,
    shorts_size: t.shorts_size,
    age_group: t.age_group,
    guardian_name: t.guardian_name,
    qrDataUrl: qrDataUrls[i],
  }));

  const { subject, html, text } = renderTicketEmail(
    {
      buyer_first_name: args.buyerFirstName,
      shopify_order_number: tickets[0]?.shopify_order_number ?? null,
    },
    emailTickets,
  );

  // PDF payload (same data shape, different consumer)
  const pdfBuffer = await generateTicketPDF(
    tickets.map((t: TicketRow) => ({
      token: t.token,
      shopify_order_number: t.shopify_order_number,
      ticket_type: t.ticket_type,
      event: t.event,
      holder_name: t.holder_name,
      team_slug: t.team_slug,
      jersey_size: t.jersey_size,
      shorts_size: t.shorts_size,
      age_group: t.age_group,
      guardian_name: t.guardian_name,
    })),
  );

  const { id: resendEmailId } = await sendEmail({
    to: args.buyerEmail,
    subject,
    html,
    text,
    attachments: [
      {
        filename: 'phamily-classic-tickets.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  await markTicketsEmailSent(
    tickets.map((t) => t.id),
    resendEmailId,
  );

  return true;
}
