/**
 * Vendor product configuration.
 *
 * The "Small Business & Community Partner Package" is a single Shopify
 * product with a single variant. Unlike team registrations, there are no
 * size combos — every vendor purchases the same SKU.
 *
 * The 20-spot cap is enforced two ways:
 *   1. Shopify inventory (tracked: true, qty: 20, policy: DENY) — blocks
 *      checkout once 20 are sold.
 *   2. The vendors.payment_status = 'confirmed' count in Supabase, used
 *      to display "X of 20 spots remaining" on the public page.
 *
 * Both are read-only sources of truth; do not edit one without the other.
 */

export const VENDOR_PACKAGE = {
  productId: 'gid://shopify/Product/10440053784757',
  variantId: 'gid://shopify/ProductVariant/52525995884725',
  priceCents: 10000,
  totalSpots: 20,
  productHandle: 'phamily-classic-small-business-community-partner-package',
} as const;

export type VendorPackage = typeof VENDOR_PACKAGE;
