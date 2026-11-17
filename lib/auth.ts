import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Requires a signed-in user; redirects to /login otherwise.
 * Returns the Supabase server client alongside the user to avoid
 * creating a second client in callers.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

/**
 * Requires the signed-in user to be the agency super admin;
 * redirects non-admins to the dashboard home.
 */
export async function requireSuperAdmin() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_super_admin) {
    redirect("/dashboard");
  }

  return { supabase, user };
}
