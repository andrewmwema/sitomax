import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase admin client using the service role key. BYPASSES RLS.
 *
 * May be used ONLY in server code, and only for:
 * - the public site renderer (app/s/[site]/[[...slug]])
 * - the form-submit endpoint
 * - the analytics beacon
 * - super-admin actions
 * - domain-setting actions, after authenticated site-owner or super-admin checks
 * - server-only AI reservations and accounting, after authenticated account checks
 *
 * Never import this from a client component.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
