import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function graderAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false as const, status: 401 as const };
  const { data: profile, error } = await supabase.from("profiles")
    .select("is_super_admin").eq("id", user.id).maybeSingle();
  if (error) {
    console.error("Could not verify grader administrator", { code: error.code });
    return { ok: false as const, status: 503 as const };
  }
  if (!profile?.is_super_admin) return { ok: false as const, status: 403 as const };
  return { ok: true as const, supabase };
}
