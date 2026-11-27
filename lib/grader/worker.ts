import "server-only";

import { createClient } from "@supabase/supabase-js";

export function graderWorker() {
  const secret = process.env.GRADER_WORKER_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!secret || secret.length < 32 || !url || !key) throw new Error("Grader worker is not configured.");
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-grader-worker-secret": secret } },
  });
  return { client, secret };
}

export async function graderRpc(name: string, args: Record<string, unknown>) {
  const { client, secret } = graderWorker();
  const { data, error } = await client.rpc(name, { p_secret: secret, ...args });
  if (error) {
    console.error("Grader database operation failed", { operation: name, code: error.code });
    throw new Error("Grader database operation failed.");
  }
  return data as unknown;
}
