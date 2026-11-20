import "server-only";

import { createClient } from "@supabase/supabase-js";

export function leadReplyWorker() {
  const secret = process.env.LEAD_WORKER_SECRET;
  if (!secret || secret.length < 32 || secret.length > 512) throw new Error("Lead email worker is not configured.");
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { client, secret };
}
