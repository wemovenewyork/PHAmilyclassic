import { z } from 'zod';
import { CUSTOM_MIN_USD, CUSTOM_MAX_USD } from './donations-config';

/**
 * Validation for the POST /api/donate request body.
 *
 * Modeled as a discriminated union on `donation_type` so TypeScript
 * narrows tier_amount / custom_amount_usd correctly in downstream code.
 *
 * All donor fields are optional EXCEPT donor_email on the custom-amount path
 * (Shopify draft orders require an email to send the invoice).
 */

// Shared donor fields, used by both branches.
const donorFieldsShape = {
  donor_first_name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .optional()
    .nullable()
    .transform(v => (v === '' ? null : v ?? null)),

  donor_email: z
    .string()
    .trim()
    .email()
    .max(254)
    .optional()
    .nullable()
    .transform(v => (v === '' ? null : v ?? null)),

  public_message: z
    .string()
    .trim()
    .max(280)
    .optional()
    .nullable()
    .transform(v => (v === '' ? null : v ?? null)),

  is_anonymous: z.boolean().default(false),
};

const tierDonationSchema = z.object({
  donation_type: z.literal('tier'),
  tier_amount: z.enum(['25', '50', '100', '250']),
  ...donorFieldsShape,
});

const customDonationSchema = z.object({
  donation_type: z.literal('custom'),
  custom_amount_usd: z
    .number()
    .int()
    .min(CUSTOM_MIN_USD)
    .max(CUSTOM_MAX_USD),
  ...donorFieldsShape,
  // Override: email is REQUIRED on the custom path (Shopify draft-order
  // invoice needs it). Cannot live in a .superRefine because Zod v3's
  // discriminatedUnion rejects ZodEffects-wrapped branches.
  donor_email: z
    .string({
      required_error: 'Email is required for custom amounts (used to send the invoice).',
    })
    .trim()
    .email('Email is required for custom amounts (used to send the invoice).')
    .max(254),
});

export const donationSchema = z.discriminatedUnion('donation_type', [
  tierDonationSchema,
  customDonationSchema,
]);

export type DonationInput = z.infer<typeof donationSchema>;
export type TierDonationInput = z.infer<typeof tierDonationSchema>;
export type CustomDonationInput = z.infer<typeof customDonationSchema>;

/**
 * Resolves canonical USD amount (whole dollars) for either path.
 * Type-narrowed: no non-null assertions needed.
 */
export function resolveDonationUsd(input: DonationInput): number {
  if (input.donation_type === 'tier') {
    return Number(input.tier_amount);
  }
  return input.custom_amount_usd;
}
