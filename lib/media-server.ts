import "server-only";

import { requireUser, requireSuperAdmin } from "@/lib/auth";
import { getOrCreateInternalAccount } from "@/lib/accounts";
import { MediaError, mediaScopeSchema, type MediaScope } from "@/lib/media";

export async function mediaAccess(raw: MediaScope) {
  const scope = mediaScopeSchema.parse(raw);
  if (scope.agency) {
    const { supabase } = await requireSuperAdmin();
    return { supabase, siteId: await getOrCreateInternalAccount(), isAdmin: true };
  }
  const { supabase } = await requireUser();
  const [{ data: site, error }, { data: isAdmin, error: roleError }] = await Promise.all([
    supabase.from("sites").select("id, account_id").eq("id", scope.siteId!).maybeSingle(),
    supabase.rpc("is_super_admin"),
  ]);
  if (error || roleError) throw new MediaError("Could not verify access to this site's media.");
  if (!site) throw new MediaError("This site is unavailable to your account.");
  return { supabase, siteId: site.id as string, isAdmin: isAdmin === true };
}
