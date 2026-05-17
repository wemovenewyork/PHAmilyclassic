import { z } from 'zod';
import { JERSEY_SIZES, SHORTS_SIZES, TEAMS } from './teams-config';

/**
 * Single Zod schema used for BOTH client-side validation (instant feedback)
 * AND server-side validation (security). Don't trust the client — the server
 * runs this same schema before writing to the DB.
 */

const TEAM_SLUGS = TEAMS.map((t) => t.slug) as [string, ...string[]];
const ALL_JERSEY_SIZES = [...JERSEY_SIZES.adult, ...JERSEY_SIZES.youth];
const ALL_SHORTS_SIZES = [...SHORTS_SIZES.adult, ...SHORTS_SIZES.youth];

/** Phone validation: accept common US formats, strip non-digits for storage. */
const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Phone number is too short')
  .max(20, 'Phone number is too long')
  .refine((v) => /\d/.test(v), 'Phone number must contain digits');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254, 'Email is too long');

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name is too long')
  .regex(/^[a-zA-Z\u00C0-\u017F .'-]+$/, "Letters, spaces, and ' - . only");

export const registrationFormSchema = z
  .object({
    team_slug: z.enum(TEAM_SLUGS, {
      errorMap: () => ({ message: 'Pick a team' }),
    }),

    full_name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,

    jersey_size: z.enum(ALL_JERSEY_SIZES as [string, ...string[]], {
      errorMap: () => ({ message: 'Select a jersey size' }),
    }),
    shorts_size: z.enum(ALL_SHORTS_SIZES as [string, ...string[]], {
      errorMap: () => ({ message: 'Select a shorts size' }),
    }),

    // Youth-only fields (validated conditionally below)
    guardian_name: nameSchema.optional().or(z.literal('')),
    guardian_phone: phoneSchema.optional().or(z.literal('')),
    guardian_email: emailSchema.optional().or(z.literal('')),

    // Required acknowledgments
    refund_acknowledged: z.literal(true, {
      errorMap: () => ({
        message: 'You must acknowledge the no-refund policy to register',
      }),
    }),
    sizes_acknowledged: z.literal(true, {
      errorMap: () => ({
        message: 'You must confirm your sizes are correct',
      }),
    }),
  })
  .superRefine((data, ctx) => {
    // Find the team to determine age group
    const team = TEAMS.find((t) => t.slug === data.team_slug);
    if (!team) return; // already errored above

    if (team.ageGroup === 'youth') {
      // Knights teams require guardian fields
      if (!data.guardian_name || data.guardian_name.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['guardian_name'],
          message: "Guardian's name is required for Knights teams",
        });
      }
      if (!data.guardian_phone || data.guardian_phone.trim().length < 7) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['guardian_phone'],
          message: "Guardian's phone is required for Knights teams",
        });
      }
      if (!data.guardian_email || !data.guardian_email.includes('@')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['guardian_email'],
          message: "Guardian's email is required for Knights teams",
        });
      }

      // Youth sizes must be from the youth size list
      const validYouthJersey = JERSEY_SIZES.youth.includes(data.jersey_size as never);
      if (!validYouthJersey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jersey_size'],
          message: 'Pick a size from the youth options',
        });
      }
      const validYouthShorts = SHORTS_SIZES.youth.includes(data.shorts_size as never);
      if (!validYouthShorts) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shorts_size'],
          message: 'Pick a size from the youth options',
        });
      }
    } else {
      // Adult teams must use adult sizes
      const validAdultJersey = JERSEY_SIZES.adult.includes(data.jersey_size as never);
      if (!validAdultJersey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jersey_size'],
          message: 'Pick a size from the adult options',
        });
      }
      const validAdultShorts = SHORTS_SIZES.adult.includes(data.shorts_size as never);
      if (!validAdultShorts) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shorts_size'],
          message: 'Pick a size from the adult options',
        });
      }
    }
  });

export type RegistrationFormInput = z.input<typeof registrationFormSchema>;
export type RegistrationFormData = z.output<typeof registrationFormSchema>;
