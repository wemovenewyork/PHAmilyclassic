import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase clients.
 *
 * Two clients exist:
 *  - `supabaseBrowser`: uses the ANON key. Safe to import in client components.
 *    Read-only access (constrained by RLS), can't touch service_role tables.
 *  - `supabaseAdmin`: uses the SERVICE_ROLE key. NEVER import in a client
 *    component or anywhere that ships to the browser. Bypasses RLS entirely.
 *
 * The 'server-only' import on the admin module is a build-time guard: any
 * client component that accidentally imports it will fail to build.
 */

// ---- Environment guards ----------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Throw at module load so missing env vars surface immediately, not in a
  // confusing runtime error two pages deep.
  throw new Error(
    'Missing Supabase environment variables. Set SUPABASE_URL and SUPABASE_ANON_KEY ' +
      'in Vercel project settings and in your local .env.local file.'
  );
}

// ---- Browser client (anon) -------------------------------------------------
// Read-only views and RLS-permitted queries. Safe in client components.
export const supabaseBrowser: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
