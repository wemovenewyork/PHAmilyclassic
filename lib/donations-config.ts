/**
 * Donation product configuration for the Interstate PHAmily Classic.
 *
 * Shop: whencecameyouniversity.myshopify.com
 * Product: "Support the PHAmily — Donation"
 * Host: AUL Lodge #14 (fraternal org, NOT a 501(c) nonprofit).
 *
 * Tier path uses Shopify Storefront API carts with fixed-price variants.
 * Custom path uses Shopify Admin API draft orders with a one-off line item.
 */

export const DONATION_PRODUCT_ID = 'gid://shopify/Product/10441536897205';

export type DonationTier = {
  amount: 25 | 50 | 100 | 250;
  label: 'Friend' | 'Supporter' | 'Patron' | 'Champion';
  variantId: string;
};

export const DONATION_TIERS: readonly DonationTier[] = [
  { amount: 25,  label: 'Friend',    variantId: 'gid://shopify/ProductVariant/52535680204981' },
  { amount: 50,  label: 'Supporter', variantId: 'gid://shopify/ProductVariant/52535680237749' },
  { amount: 100, label: 'Patron',    variantId: 'gid://shopify/ProductVariant/52535680270517' },
  { amount: 250, label: 'Champion',  variantId: 'gid://shopify/ProductVariant/52535680303285' },
] as const;

export const TIER_BY_AMOUNT: Record<string, DonationTier> = Object.fromEntries(
  DONATION_TIERS.map(t => [String(t.amount), t])
);

export const CUSTOM_MIN_USD = 5;
export const CUSTOM_MAX_USD = 5000;

/**
 * Numeric product ID for webhook matching.
 * Shopify webhooks send legacy numeric IDs in line_items[].product_id, not GIDs.
 * Derived from DONATION_PRODUCT_ID above — keep in sync if the product is ever recreated.
 */
export const DONATION_PRODUCT_NUMERIC_ID = '10441536897205';

/**
 * Compliance copy — use this exact line on every donation surface
 * (homepage section, /donate page, thanks page, donor wall footer).
 */
export const DONATION_DISCLAIMER =
  'AUL #14 is a fraternal organization, not a 501(c) nonprofit. Donations are not tax-deductible.';
