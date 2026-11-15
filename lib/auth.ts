import { redirect } from "next/navigation";
import { headers } from "next/headers";
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

/**
 * The origin of the current request (protocol + host), for building
 * absolute URLs in Server Actions (e.g. auth email redirects).
 */
export async function getRequestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host =
    headerStore.get("host") ??
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ??
    "localhost:3000";
  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
