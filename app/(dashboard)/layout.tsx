import { Suspense } from "react";
import { getAgencySettings } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { signOut } from "./actions";

/**
 * Dashboard shell: auth gate + branded sidebar. Everything dynamic
 * (cookies/auth/DB) lives inside the Suspense boundary, as required by
 * cacheComponents.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full bg-zinc-50">
          <div className="hidden w-64 shrink-0 animate-pulse border-r border-zinc-200 bg-white md:block" />
          <div className="flex-1" />
        </div>
      }
    >
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}

async function DashboardShell({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();

  const [{ data: profile }, settings] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, full_name, is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
    getAgencySettings(),
  ]);

  return (
    <div
      className="platform-ui flex min-h-screen w-full bg-[#F7F7F5] text-[#121212]"
    >
      {/* Fonts are scoped to platform chrome rather than client sites. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&display=swap" />
      <Sidebar
        agencyName={settings.name}
        logoUrl={settings.logoUrl}
        isSuperAdmin={profile?.is_super_admin ?? false}
        userEmail={profile?.email ?? user.email ?? ""}
        userName={profile?.full_name ?? ""}
        signOutAction={signOut}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1276px] px-4 py-8 sm:px-8 lg:px-12 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
