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
