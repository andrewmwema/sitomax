import { createClient } from "@supabase/supabase-js";
import { redirectPathSchema } from "@/lib/seo";

const cache = new Map<string, { value: string | null; expires: number }>();

export async function lookupTenantRedirect(host: string, path: string): Promise<string | null> {
  const key = JSON.stringify([host, path]);
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.value;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("lookup_tenant_redirect", { p_host: host.replace(/:\d+$/, ""), p_path: path });
  if (error) throw new Error("Could not check redirects.", { cause: error });
  if (data !== null && !redirectPathSchema.safeParse(data).success) throw new Error("Invalid redirect destination.");
  if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
  cache.set(key, { value: data, expires: Date.now() + 30_000 });
  return data;
}
