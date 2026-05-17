import { z } from 'zod';

/**
 * Server-side validation for the vendor intake form.
 *
 * Matches the shape submitted by <VendorForm /> on POST /api/vendor.
 * Never trust client validation — this is the source of truth.
 */
export const vendorFormSchema = z.object({
  company_name: z
    .string()
    .trim()
    .min(2, 'Company name is required')
    .max(120, 'Company name is too long'),

  contact_name: z
    .string()
    .trim()
    .min(2, 'Contact name is required')
    .max(120, 'Contact name is too long'),

  email: z
    .string()
    .trim()
    .email('Please enter a valid email')
    .max(200, 'Email is too long'),

  phone: z
    .string()
    .trim()
    .min(7, 'Phone number is required')
    .max(30, 'Phone number is too long'),

  product_description: z
    .string()
    .trim()
    .min(20, 'Please describe what you will be selling or promoting (at least 20 characters)')
    .max(2000, 'Product description is too long (max 2000 characters)'),

  website: z
    .string()
    .trim()
    .max(300, 'Website is too long')
    .optional()
    .or(z.literal('')),

  terms_acknowledged: z
    .literal(true, {
      errorMap: () => ({ message: 'You must acknowledge the vendor terms to register.' }),
    }),
});

export type VendorFormData = z.infer<typeof vendorFormSchema>;
