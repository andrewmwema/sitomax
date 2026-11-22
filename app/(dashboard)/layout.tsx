import { Suspense } from "react";
import { getAgencySettings } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { signOut } from "./actions";
import { ChevronRight, Layers2 } from "lucide-react";
import { nearestContrast } from "@/lib/theme/contrast";
import type { CSSProperties } from "react";

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

  const [{ data: profile }, settings, unread] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, full_name, is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
    getAgencySettings(),
    supabase.from("form_submissions").select("id", { count: "exact", head: true })
      .eq("archived", false).is("deleted_at", null).or("is_read.eq.false,has_unread_reply.eq.true,unread.eq.true"),
  ]);
  if (unread.error) console.error("Could not load unread submissions:", unread.error.message);
  const accent = nearestContrast(settings.primaryColor, ["#ffffff", "#e5e3e1"]) ?? "#4b3fe0";

  return (
    <div
      className="platform-ui relative flex min-h-screen w-full overflow-x-clip"
      style={{ "--platform-accent": accent } as CSSProperties}
    >
      {/* Fonts are scoped to platform chrome rather than client sites. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&display=swap" />
      <a href="#dashboard-content" className="platform-skip-link">Skip to content</a>
      <Sidebar
        agencyName={settings.name}
        logoUrl={settings.logoUrl}
        isSuperAdmin={profile?.is_super_admin ?? false}
        userEmail={profile?.email ?? user.email ?? ""}
        userName={profile?.full_name ?? ""}
        unreadCount={unread.error ? null : unread.count ?? 0}
        signOutAction={signOut}
      />
      <main id="dashboard-content" tabIndex={-1} className="min-w-0 flex-1">
        <div className="platform-header flex min-h-16 items-center justify-between gap-3 pl-16 pr-4 sm:pr-8 md:px-8 lg:px-10">
          <div className="flex min-w-0 items-center gap-2 text-xs text-[#6B6A66]">
            <Layers2 size={15} className="shrink-0" />
            <span className="hidden sm:inline">Workspace</span>
            <ChevronRight size={12} className="shrink-0 text-[#B5B2A9]" />
            <span className="truncate font-medium text-[#3D3C39]">{settings.name}</span>
          </div>
          <span className="shrink-0 rounded-full border border-[#E8E7E3] bg-white px-2.5 py-1 text-[10px] font-medium tracking-wide text-[#6B6A66]">
            {profile?.is_super_admin ? "Agency workspace" : "Client workspace"}
          </span>
        </div>
        <div className="platform-content mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
