import "server-only";

import { createClient } from "@supabase/supabase-js";
import { EmailDeliveryError } from "@/lib/email";

export function leadReplyWorker() {
  const secret = process.env.LEAD_WORKER_SECRET;
  if (!secret || secret.length < 32 || secret.length > 512) throw new EmailDeliveryError("Lead email worker is not configured. Contact your agency.");
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { client, secret };
}
