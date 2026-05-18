import { NextResponse } from 'next/server';
import { donationSchema, resolveDonationUsd } from '@/lib/donations-schema';
import { TIER_BY_AMOUNT } from '@/lib/donations-config';
import {
  insertPendingDonation,
  markDonationFailed,
  attachShopifyToDonation,
} from '@/lib/db-donations';
import {
  createCartForDonationTier,
  createDraftOrderForCustomDonation,
} from '@/lib/shopify-storefront';

/**
 * POST /api/donate
 *
 * 1. Validates the donation payload server-side (zod discriminated union).
 * 2. Creates a 'pending' donation row in Supabase. (The row id is attached
 *    to the Shopify cart / draft order as `donation_id`; the webhook handler
 *    matches on it to flip the row to 'confirmed' after payment.)
 * 3. Branches on donation_type:
 *      - 'tier'   → Storefront cartCreate with a fixed-price variant
 *      - 'custom' → Admin draftOrderCreate with a one-off line item
 * 4. Attaches Shopify identifiers to the donation row (best-effort — the
 *    webhook can also match on the cart attribute, so an attach failure is
 *    logged but not surfaced to the user).
 * 5. Returns the checkoutUrl so the client redirects to Shopify checkout
 *    (or, on the custom path, the hosted draft-order invoice URL).
 *
 * On Shopify failure: actively marks the pending row as 'failed' via a
 * fire-and-forget call (don't block the response). The cleanup cron remains
 * the backstop for any row that wasn't marked. This is a deliberate upgrade
 * from the register/vendor routes, which rely on the cron alone — donations
 * are higher-velocity than 6 teams or 20 vendor spots, and a marked-failed
 * row is clearer for reconciliation than a stale pending row.
 */
export async function POST(req: Request) {
  // ----- Parse + zod validate -----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  const parsed = donationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // ----- Create pending donation row -----
  const insertResult = await insertPendingDonation(input);
  if (!insertResult.ok) {
    // eslint-disable-next-line no-console
    console.error('[/api/donate] insert pending donation failed', insertResult.error);
    return NextResponse.json(
      { error: insertResult.error ?? 'server-error' },
      { status: 500 }
    );
  }
  const donationId = insertResult.donation.id;
  const amountUsd = resolveDonationUsd(input);

  // ----- Branch: fixed tier (Storefront cart) -----
  if (input.donation_type === 'tier') {
    const variantId = TIER_BY_AMOUNT[input.tier_amount].variantId;

    let checkoutUrl: string;
    try {
      const cart = await createCartForDonationTier({
        variantId,
        amountUsd,
        donationId,
        donorEmail: input.donor_email,
        donorFirstName: input.donor_first_name,
      });
      checkoutUrl = cart.checkoutUrl;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[/api/donate] tier cart create failed', err);
      // Fire and forget — don't block the response on this completing.
      // In a serverless runtime this may not always finish before the function
      // is killed; the cleanup cron is the backstop.
      markDonationFailed(donationId).catch((mfErr) => {
        // eslint-disable-next-line no-console
        console.error('[/api/donate] markDonationFailed background error', mfErr);
      });
      return NextResponse.json(
        { error: 'checkout-create-failed' },
        { status: 502 }
      );
    }

    // Best-effort: attach Shopify ids to the pending row. The webhook can
    // match on the cart attribute alone, so a failure here is non-fatal —
    // the user already has a working checkout URL.
    const attachResult = await attachShopifyToDonation(donationId, {
      shopify_variant_id: variantId,
      shopify_checkout_url: checkoutUrl,
    });
    if (!attachResult.ok) {
      // eslint-disable-next-line no-console
      console.error(
        '[/api/donate] attach shopify ids failed (soft)',
        attachResult.error
      );
    }

    return NextResponse.json(
      { ok: true, donationId, checkoutUrl },
      { status: 200 }
    );
  }

  // ----- Branch: custom amount (Admin draft order) -----
  // Schema guarantees donor_email is non-null on the custom branch.
  let draftOrderId: string;
  let invoiceUrl: string;
  try {
    const draft = await createDraftOrderForCustomDonation({
      amountUsd,
      donationId,
      donorEmail: input.donor_email,
      donorFirstName: input.donor_first_name,
    });
    draftOrderId = draft.draftOrderId;
    invoiceUrl = draft.invoiceUrl;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/donate] custom draft order create failed', err);
    markDonationFailed(donationId).catch((mfErr) => {
      // eslint-disable-next-line no-console
      console.error('[/api/donate] markDonationFailed background error', mfErr);
    });
    return NextResponse.json(
      { error: 'checkout-create-failed' },
      { status: 502 }
    );
  }

  // Best-effort: attach the draft id + invoice URL to the pending row.
  const attachResult = await attachShopifyToDonation(donationId, {
    shopify_draft_order_id: draftOrderId,
    shopify_checkout_url: invoiceUrl,
  });
  if (!attachResult.ok) {
    // eslint-disable-next-line no-console
    console.error(
      '[/api/donate] attach shopify ids failed (soft)',
      attachResult.error
    );
  }

  return NextResponse.json(
    { ok: true, donationId, checkoutUrl: invoiceUrl },
    { status: 200 }
  );
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
