import { NextResponse } from 'next/server';
import { vendorFormSchema } from '@/lib/vendor-schema';
import { createPendingVendor, getVendorSpotCount } from '@/lib/db-vendors';
import { VENDOR_PACKAGE } from '@/lib/vendor-config';
import { createCartForVendor } from '@/lib/shopify-storefront';

/**
 * POST /api/vendor
 *
 * 1. Validates the form payload server-side (zod).
 * 2. Checks the vendor cap (server-side recheck — never trust the client).
 * 3. Creates a 'pending' vendor row in Supabase. (This row's id is embedded
 *    in the Shopify cart's attributes; the webhook handler uses it to flip
 *    the row to 'confirmed' after payment.)
 * 4. Creates a Shopify cart with the vendor variant + cart/line attributes.
 * 5. Returns the cart's checkoutUrl so the client redirects to Shopify.
 *
 * No deadline check here — vendors can register up to the event itself,
 * limited only by the 20-spot cap.
 */
export async function POST(req: Request) {
  // ----- Parse + zod validate -----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  const parsed = vendorFormSchema.safeParse(body);
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

  // ----- Fast-fail cap check -----
  // The createPendingVendor() call also rechecks, but doing it here saves
  // us from creating an orphan row when the cap is already hit.
  const spotCheck = await getVendorSpotCount();
  if (spotCheck.is_full) {
    return NextResponse.json({ error: 'vendors-full' }, { status: 400 });
  }

  // ----- Create pending vendor row (recheck happens inside) -----
  const result = await createPendingVendor({
    company_name: data.company_name,
    contact_name: data.contact_name,
    email: data.email,
    phone: data.phone,
    product_description: data.product_description,
    website: data.website || null,
  });

  if (!result.ok) {
    if ('vendorsFull' in result) {
      return NextResponse.json({ error: 'vendors-full' }, { status: 400 });
    }
    return NextResponse.json(
      { error: result.error ?? 'server-error' },
      { status: 500 }
    );
  }

  // ----- Create Shopify cart, get checkoutUrl -----
  try {
    const { checkoutUrl } = await createCartForVendor({
      variantId: VENDOR_PACKAGE.variantId,
      vendorId: result.vendorId,
      companyName: data.company_name,
      contactName: data.contact_name,
      buyerEmail: data.email,
      buyerPhone: data.phone,
      productDescription: data.product_description,
      website: data.website || null,
    });

    return NextResponse.json(
      {
        ok: true,
        vendorId: result.vendorId,
        checkoutUrl,
      },
      { status: 200 }
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/vendor] cart create failed', err);
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
