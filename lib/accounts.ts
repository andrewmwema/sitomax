import "server-only";

import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getOrCreateInternalAccount(): Promise<string> {
  const { user } = await requireSuperAdmin();
  const { data, error } = await createAdminClient().rpc("get_or_create_internal_account", {
    p_user_id: user.id,
    p_name: brand.name,
  });
  if (error) throw new Error("Could not initialize the internal agency account. Apply migration 0019 and retry.", { cause: error });
  return z.uuid().parse(data);
}

export async function getSiteAccountOptions() {
  const { supabase } = await requireSuperAdmin();
  const internalId = await getOrCreateInternalAccount();
  const { data, error } = await supabase.from("accounts").select("id, name, is_internal")
    .eq("is_internal", false).order("name");
  if (error) throw new Error("Could not load client accounts.", { cause: error });
  return [{ id: internalId, name: `${brand.name} (internal)`, is_internal: true }, ...(data ?? [])];
}
