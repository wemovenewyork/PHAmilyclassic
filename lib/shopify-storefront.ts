import 'server-only';

/**
 * Shopify Storefront API client.
 *
 * Server-only. Uses the private Storefront access token, which has higher
 * rate limits and is safer than the public token for unauthenticated reads
 * and cart mutations.
 *
 * Read about the Storefront API: https://shopify.dev/docs/api/storefront/latest
 *
 * Architecture note: we use the Cart object (not the legacy Checkout). The
 * Cart's checkoutUrl is what we redirect the buyer to in order to complete
 * payment in Shopify's hosted checkout.
 */

const STOREFRONT_API_VERSION = '2026-01';
const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const STOREFRONT_ACCESS_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

if (!STORE_DOMAIN || !STOREFRONT_ACCESS_TOKEN) {
  throw new Error(
    'Missing Shopify Storefront env vars. Set SHOPIFY_STORE_DOMAIN and ' +
      'SHOPIFY_STOREFRONT_ACCESS_TOKEN in Vercel project settings and .env.local. ' +
      'See README.md Phase 3 setup for details.'
  );
}

const STOREFRONT_API_URL = `https://${STORE_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`;

/**
 * Low-level Storefront API caller. All Storefront API calls go through here
 * so logging, error handling, and headers stay consistent.
 */
async function storefrontFetch<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(STOREFRONT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_ACCESS_TOKEN!,
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    // Force no caching — cart mutations must always hit Shopify fresh
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Shopify Storefront API HTTP ${res.status}: ${text.slice(0, 500)}`
    );
  }

  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string; path?: string[] }>;
  };

  if (body.errors && body.errors.length > 0) {
    throw new Error(
      `Shopify Storefront GraphQL error: ${body.errors
        .map((e) => e.message)
        .join('; ')}`
    );
  }

  if (!body.data) {
    throw new Error('Shopify Storefront API returned no data');
  }

  return body.data;
}

// ============================================================================
// Cart creation
// ============================================================================

interface CartCreateResult {
  cartCreate: {
    cart: {
      id: string;
      checkoutUrl: string;
    } | null;
    userErrors: Array<{ field: string[] | null; message: string; code?: string | null }>;
  };
}

/**
 * Look up the FIRST available variant ID for a product by jersey + shorts size.
 *
 * Each team product has 36 variants (jersey × shorts size combinations).
 * The Storefront API only exposes the variantId once we query the product —
 * there's no "find variant by option values" endpoint, so we fetch the
 * product's variants and match locally.
 *
 * Cached by Next.js fetch dedup within a single request.
 */
export async function findTeamVariantId(args: {
  productId: string; // numeric ID, e.g. "10438339002549"
  jerseySize: string;
  shortsSize: string;
}): Promise<string | null> {
  const productGid = `gid://shopify/Product/${args.productId}`;

  // Storefront variants are paginated. With 36 variants per product, one page
  // (default 100) is enough.
  const query = `#graphql
    query ProductVariants($id: ID!) {
      product(id: $id) {
        id
        title
        variants(first: 100) {
          nodes {
            id
            availableForSale
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  `;

  const data = await storefrontFetch<{
    product: {
      id: string;
      title: string;
      variants: {
        nodes: Array<{
          id: string;
          availableForSale: boolean;
          selectedOptions: Array<{ name: string; value: string }>;
        }>;
      };
    } | null;
  }>(query, { id: productGid });

  if (!data.product) return null;

  const match = data.product.variants.nodes.find((v) => {
    const jersey = v.selectedOptions.find((o) => o.name === 'Jersey Size')?.value;
    const shorts = v.selectedOptions.find((o) => o.name === 'Shorts Size')?.value;
    return jersey === args.jerseySize && shorts === args.shortsSize;
  });

  return match?.id ?? null;
}

/**
 * Create a cart with one team-registration variant and a set of attributes
 * that identify the player and registration in Supabase.
 *
 * Returns the checkoutUrl that the buyer should be redirected to.
 *
 * The `registrationId` is attached to the cart as a custom attribute. When the
 * webhook fires on orders/paid, we read it from the order's `note_attributes`
 * and use it to match the order back to a pending Supabase row.
 */
export async function createCartForRegistration(args: {
  variantId: string; // gid://shopify/ProductVariant/...
  registrationId: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerFullName: string;
  teamSlug: string;
  teamName: string;
  jerseySize: string;
  shortsSize: string;
  isYouth: boolean;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
}): Promise<{ checkoutUrl: string; cartId: string }> {
  const cartAttributes: Array<{ key: string; value: string }> = [
    { key: 'registration_id', value: args.registrationId },
    { key: 'team_slug', value: args.teamSlug },
    { key: 'team_name', value: args.teamName },
    { key: 'player_full_name', value: args.buyerFullName },
    { key: 'jersey_size', value: args.jerseySize },
    { key: 'shorts_size', value: args.shortsSize },
    { key: 'is_youth', value: args.isYouth ? 'true' : 'false' },
  ];

  if (args.isYouth) {
    if (args.guardianName)
      cartAttributes.push({ key: 'guardian_name', value: args.guardianName });
    if (args.guardianPhone)
      cartAttributes.push({ key: 'guardian_phone', value: args.guardianPhone });
    if (args.guardianEmail)
      cartAttributes.push({ key: 'guardian_email', value: args.guardianEmail });
  }

  // Line item attributes appear on the line itself in Shopify admin AND on the
  // ticket emails. Cart attributes appear on the order's note_attributes.
  // We duplicate the key fields onto the line so they're visible in the order
  // summary in the Shopify admin.
  const lineAttributes: Array<{ key: string; value: string }> = [
    { key: 'Player Name', value: args.buyerFullName },
    { key: 'Team', value: args.teamName },
    { key: 'Jersey Size', value: args.jerseySize },
    { key: 'Shorts Size', value: args.shortsSize },
  ];

  const mutation = `#graphql
    mutation CreateCart($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    input: {
      attributes: cartAttributes,
      buyerIdentity: {
        email: args.buyerEmail,
        phone: args.buyerPhone,
      },
      lines: [
        {
          merchandiseId: args.variantId,
          quantity: 1,
          attributes: lineAttributes,
        },
      ],
      note: `${args.teamName} — ${args.buyerFullName} (registration ${args.registrationId})`,
    },
  };

  const data = await storefrontFetch<CartCreateResult>(mutation, variables);

  if (data.cartCreate.userErrors.length > 0) {
    throw new Error(
      `Cart create failed: ${data.cartCreate.userErrors
        .map((e) => `${e.field?.join('.') ?? '?'}: ${e.message}`)
        .join('; ')}`
    );
  }

  if (!data.cartCreate.cart) {
    throw new Error('Cart create returned no cart');
  }

  return {
    checkoutUrl: data.cartCreate.cart.checkoutUrl,
    cartId: data.cartCreate.cart.id,
  };
}
// ============================================================================
// Vendor cart creation
// ============================================================================

interface CreateVendorCartParams {
  variantId: string;
  vendorId: string;
  companyName: string;
  contactName: string;
  buyerEmail: string;
  buyerPhone: string;
  productDescription: string;
  website?: string | null;
}

/**
 * Create a Shopify checkout cart for a vendor package purchase.
 *
 * Mirrors createCartForRegistration() but for the standalone vendor product.
 * Single variant — no jersey/shorts lookup needed.
 *
 * Returns the hosted Shopify checkoutUrl. The vendor row in Supabase stays
 * in `pending` status until the order webhook fires post-payment.
 */
export async function createCartForVendor(
  params: CreateVendorCartParams
): Promise<{ checkoutUrl: string; cartId: string }> {
  const {
    variantId,
    vendorId,
    companyName,
    contactName,
    buyerEmail,
    buyerPhone,
    productDescription,
    website,
  } = params;

  const cartAttributes: Array<{ key: string; value: string }> = [
    { key: 'vendor_id', value: vendorId },
    { key: 'company_name', value: companyName },
    { key: 'contact_name', value: contactName },
    { key: 'product_description', value: productDescription },
  ];
  if (website) {
    cartAttributes.push({ key: 'website', value: website });
  }

  const lineAttributes: Array<{ key: string; value: string }> = [
    { key: 'Company', value: companyName },
    { key: 'Contact', value: contactName },
    { key: 'Product / Service', value: productDescription.slice(0, 200) },
  ];

  const note = `Vendor package — ${companyName} (${contactName})`;

  const mutation = `#graphql
    mutation CartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    input: {
      attributes: cartAttributes,
      buyerIdentity: {
        email: buyerEmail,
        phone: buyerPhone,
      },
      lines: [
        {
          merchandiseId: variantId,
          quantity: 1,
          attributes: lineAttributes,
        },
      ],
      note,
    },
  };

  const data = await storefrontFetch<CartCreateResult>(mutation, variables);

  if (data.cartCreate.userErrors.length > 0) {
    const errors = data.cartCreate.userErrors
      .map((e) => `${e.field?.join('.') ?? '?'}: ${e.message}`)
      .join('; ');
    throw new Error(`Shopify cartCreate userErrors: ${errors}`);
  }

  if (!data.cartCreate.cart) {
    throw new Error('Shopify cartCreate returned no cart');
  }

  return {
    checkoutUrl: data.cartCreate.cart.checkoutUrl,
    cartId: data.cartCreate.cart.id,
  };
}
// ============================================================================
// Donation flow — tier (Storefront cartCreate) and custom (Admin draftOrderCreate)
// ============================================================================

const ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? '2024-10';

/**
 * Low-level Admin API caller. Mirrors storefrontFetch() but targets the
 * Admin API endpoint with the Admin token. Lazy-evaluates the env var so
 * the entire module doesn't fail to load when the Admin token is missing
 * — only the custom-donation path needs it.
 */
async function adminFetch<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!ADMIN_TOKEN) {
    throw new Error(
      'Shopify Admin API token missing. Set SHOPIFY_ADMIN_API_TOKEN in Vercel and .env.local.'
    );
  }
  const ADMIN_API_URL = `https://${STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`;

  const res = await fetch(ADMIN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_TOKEN,
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    // Force no caching — order/draft mutations must always hit Shopify fresh
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Shopify Admin API HTTP ${res.status}: ${text.slice(0, 500)}`
    );
  }

  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string; path?: string[] }>;
  };

  if (body.errors && body.errors.length > 0) {
    throw new Error(
      `Shopify Admin GraphQL error: ${body.errors
        .map((e) => e.message)
        .join('; ')}`
    );
  }

  if (!body.data) {
    throw new Error('Shopify Admin API returned no data');
  }

  return body.data;
}

/**
 * Create a Storefront cart for a fixed-tier donation ($25/$50/$100/$250).
 * The donor is redirected to the cart's hosted checkoutUrl.
 *
 * The `donationId` is attached as a cart attribute. When the orders/paid
 * webhook fires, the handler reads `order.note_attributes.donation_id` to
 * find the matching pending row in the Supabase `donations` table and flip
 * its `payment_status` to 'confirmed'.
 */
export async function createCartForDonationTier(args: {
  variantId: string;
  amountUsd: number;
  donationId: string;
  donorEmail?: string | null;
  donorFirstName?: string | null;
}): Promise<{ checkoutUrl: string; cartId: string }> {
  const { variantId, amountUsd, donationId, donorEmail, donorFirstName } = args;

  const cartAttributes: Array<{ key: string; value: string }> = [
    { key: 'donation_id', value: donationId },
    { key: 'donation_type', value: 'tier' },
    { key: 'donation_tier', value: String(amountUsd) },
    ...(donorFirstName ? [{ key: 'donor_first_name', value: donorFirstName }] : []),
  ];

  const note = donorFirstName
    ? `PHAmily Classic donation — $${amountUsd} tier — ${donorFirstName}`
    : `PHAmily Classic donation — $${amountUsd} tier`;

  const mutation = `#graphql
    mutation CartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const input: Record<string, unknown> = {
    attributes: cartAttributes,
    lines: [
      {
        merchandiseId: variantId,
        quantity: 1,
      },
    ],
    note,
  };

  if (donorEmail) {
    input.buyerIdentity = { email: donorEmail };
  }

  const data = await storefrontFetch<CartCreateResult>(mutation, { input });

  if (data.cartCreate.userErrors.length > 0) {
    const errors = data.cartCreate.userErrors
      .map((e) => `${e.field?.join('.') ?? '?'}: ${e.message}`)
      .join('; ');
    throw new Error(`Shopify cartCreate userErrors: ${errors}`);
  }

  if (!data.cartCreate.cart) {
    throw new Error('Shopify cartCreate returned no cart');
  }

  return {
    checkoutUrl: data.cartCreate.cart.checkoutUrl,
    cartId: data.cartCreate.cart.id,
  };
}

/**
 * Create a Shopify Admin draft order for a custom-amount donation.
 * The donor is redirected to the draft order's invoiceUrl, which Shopify
 * hosts as a payable checkout page.
 *
 * Unlike the tier path, this uses the Admin API (not Storefront) so we can
 * set a one-off line item price without pre-creating a variant.
 *
 * The `donationId` is attached as a customAttribute on the draft order. When
 * the orders/paid webhook fires for the order Shopify produces from this
 * draft, the handler reads `order.note_attributes.donation_id` to find the
 * matching pending row in the Supabase `donations` table and flip its
 * `payment_status` to 'confirmed'. The handler can also fall back to
 * matching on `shopify_draft_order_id` — db-donations.ts supports either
 * identifier.
 *
 * We deliberately do NOT call draftOrderInvoiceSend — the donor is on the
 * page expecting to be redirected, not to receive an email. The returned
 * invoiceUrl IS the hosted checkout URL the route should redirect to.
 */
export async function createDraftOrderForCustomDonation(args: {
  amountUsd: number;
  donationId: string;
  donorEmail: string;
  donorFirstName?: string | null;
}): Promise<{ draftOrderId: string; invoiceUrl: string }> {
  const { amountUsd, donationId, donorEmail, donorFirstName } = args;

  // Deferred env-var check — only the custom-amount path needs this token.
  // Tier donations and the existing team/vendor flows don't.
  if (!process.env.SHOPIFY_ADMIN_API_TOKEN) {
    throw new Error(
      'SHOPIFY_ADMIN_API_TOKEN not configured — custom-amount donations are disabled'
    );
  }

  const customAttributes: Array<{ key: string; value: string }> = [
    { key: 'donation_id', value: donationId },
    { key: 'donation_type', value: 'custom' },
    { key: 'donation_amount_usd', value: String(amountUsd) },
    ...(donorFirstName ? [{ key: 'donor_first_name', value: donorFirstName }] : []),
  ];

  const note = donorFirstName
    ? `PHAmily Classic donation — $${amountUsd} custom — ${donorFirstName}`
    : `PHAmily Classic donation — $${amountUsd} custom`;

  const mutation = `#graphql
    mutation DraftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      email: donorEmail,
      note,
      tags: ['donation', 'custom', 'interstate-phamily-classic'],
      customAttributes,
      lineItems: [
        {
          title: `Support the PHAmily — $${amountUsd} Donation`,
          originalUnitPriceWithCurrency: {
            amount: amountUsd.toFixed(2),
            currencyCode: 'USD',
          },
          quantity: 1,
          requiresShipping: false,
          taxable: false,
        },
      ],
    },
  };

  const data = await adminFetch<{
    draftOrderCreate: {
      draftOrder: { id: string; invoiceUrl: string } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(mutation, variables);

  if (data.draftOrderCreate.userErrors.length > 0) {
    const errors = data.draftOrderCreate.userErrors
      .map((e) => `${e.field?.join('.') ?? '?'}: ${e.message}`)
      .join('; ');
    throw new Error(`Shopify draftOrderCreate userErrors: ${errors}`);
  }

  if (!data.draftOrderCreate.draftOrder) {
    throw new Error('Shopify draftOrderCreate returned no draftOrder');
  }

  return {
    draftOrderId: data.draftOrderCreate.draftOrder.id,
    invoiceUrl: data.draftOrderCreate.draftOrder.invoiceUrl,
  };
}
