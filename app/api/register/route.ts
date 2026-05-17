import { NextResponse } from 'next/server';
import { registrationFormSchema } from '@/lib/registration-schema';
import { createPendingRegistration, getTeamRowBySlug } from '@/lib/db-admin';
import {
  isRegistrationOpen,
  getTeamBySlug,
} from '@/lib/teams-config';
import {
  findTeamVariantId,
  createCartForRegistration,
} from '@/lib/shopify-storefront';

/**
 * POST /api/register
 *
 * 1. Validates the form payload server-side (zod).
 * 2. Checks the registration deadline.
 * 3. Looks up the team in Supabase and confirms it has spots remaining
 *    (server-side cap recheck — never trust the client).
 * 4. Creates a 'pending' registration row in Supabase. (This row's id is
 *    embedded in the Shopify cart's attributes; the webhook handler uses
 *    it to flip the row to 'confirmed' after payment.)
 * 5. Looks up the correct Shopify variant ID for the team + size combo.
 * 6. Creates a Shopify cart with the variant + line/cart attributes.
 * 7. Returns the cart's checkoutUrl so the client redirects to Shopify checkout.
 *
 * If anything after step 4 fails, the pending row will be cleaned up by the
 * /api/cron/cleanup endpoint (Session 4) — it sweeps pending registrations
 * older than 2 hours.
 */
export async function POST(req: Request) {
  // ----- Deadline -----
  if (!isRegistrationOpen()) {
    return NextResponse.json(
      { error: 'registration-closed' },
      { status: 400 }
    );
  }

  // ----- Parse + zod validate -----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  const parsed = registrationFormSchema.safeParse(body);
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
  const data = parsed.data;

  // ----- Resolve team -----
  const teamConfig = getTeamBySlug(data.team_slug);
  if (!teamConfig) {
    return NextResponse.json({ error: 'team-not-found' }, { status: 400 });
  }

  const teamRow = await getTeamRowBySlug(data.team_slug);
  if (!teamRow) {
    // Schema not seeded? Misconfiguration.
    // eslint-disable-next-line no-console
    console.error('[/api/register] team row missing for slug', data.team_slug);
    return NextResponse.json({ error: 'team-not-configured' }, { status: 500 });
  }

  const isYouth = teamConfig.ageGroup === 'youth';

  // ----- Look up variant first, before committing pending row -----
  // If size combo somehow doesn't exist, fail fast rather than orphaning a row.
  let variantId: string | null;
  try {
    variantId = await findTeamVariantId({
      productId: teamConfig.shopifyProductId,
      jerseySize: data.jersey_size,
      shortsSize: data.shorts_size,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/register] variant lookup failed', err);
    return NextResponse.json(
      { error: 'shopify-unavailable' },
      { status: 502 }
    );
  }

  if (!variantId) {
    // eslint-disable-next-line no-console
    console.error('[/api/register] no variant for combo', {
      productId: teamConfig.shopifyProductId,
      jersey: data.jersey_size,
      shorts: data.shorts_size,
    });
    return NextResponse.json(
      { error: 'variant-not-found' },
      { status: 400 }
    );
  }

  // ----- Create pending registration (cap recheck happens inside) -----
  const result = await createPendingRegistration({
    team_id: teamRow.id,
    full_name: data.full_name,
    email: data.email,
    phone: data.phone,
    jersey_size: data.jersey_size,
    shorts_size: data.shorts_size,
    is_youth: isYouth,
    guardian_name: isYouth ? data.guardian_name || null : null,
    guardian_phone: isYouth ? data.guardian_phone || null : null,
    guardian_email: isYouth ? data.guardian_email || null : null,
    refund_acknowledged: data.refund_acknowledged,
  });

  if (!result.ok) {
    if ('teamFull' in result) {
      return NextResponse.json({ error: 'team-full' }, { status: 400 });
    }
    return NextResponse.json(
      { error: result.error ?? 'server-error' },
      { status: 500 }
    );
  }

  // ----- Create Shopify cart, get checkoutUrl -----
  try {
    const { checkoutUrl } = await createCartForRegistration({
      variantId,
      registrationId: result.registrationId,
      buyerEmail: data.email,
      buyerPhone: data.phone,
      buyerFullName: data.full_name,
      teamSlug: data.team_slug,
      teamName: teamConfig.name,
      jerseySize: data.jersey_size,
      shortsSize: data.shorts_size,
      isYouth,
      guardianName: isYouth ? data.guardian_name || undefined : undefined,
      guardianPhone: isYouth ? data.guardian_phone || undefined : undefined,
      guardianEmail: isYouth ? data.guardian_email || undefined : undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        registrationId: result.registrationId,
        checkoutUrl,
      },
      { status: 200 }
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/register] cart create failed', err);
    // Pending row will be swept by cleanup cron; don't surface raw error.
    return NextResponse.json(
      { error: 'checkout-create-failed' },
      { status: 502 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
