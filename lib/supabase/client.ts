"use client";

import { createBrowserClient } from "@supabase/ssr";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

/**
 * Supabase client for Client Components (browser).
 * Uses the anon key; access is enforced by Postgres RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: authCookieOptions() },
  );
}
