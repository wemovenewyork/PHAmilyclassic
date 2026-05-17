import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase admin client.
 *
 * Uses the SERVICE_ROLE key, which bypasses Row-Level Security. NEVER import
 * this in a client component. The `'server-only'` import above will cause
 * any such import to fail at build time.
 *
 * Use this from:
 *  - Route handlers in /app/api/*
 *  - Server Actions
 *  - Server Components (not "use client" components)
 *  - Admin dashboard server code
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase admin environment variables. Set SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY in Vercel project settings and .env.local. ' +
      'The service_role key must never be exposed to the browser.'
  );
}

export const supabaseAdmin: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: { schema: 'public' },
  }
);
