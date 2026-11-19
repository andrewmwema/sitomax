import { Suspense } from "react";
import { LifeBuoy, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAgencySettings } from "@/lib/agency";
import { AgencySettingsForm } from "@/components/dashboard/agency-settings-form";
import { updateAgencySettings } from "./actions";

/**
 * Settings: super admins edit agency branding; clients see a read-only
 * note (their workspace is managed by the agency).
 */
export default function SettingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <p className="platform-eyebrow mb-1">Management</p>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-[var(--platform-muted)]">
          Manage your agency identity, branding, and workspace access.
        </p>
      </header>
      <Suspense
        fallback={
          <div role="status" aria-label="Loading settings" className="h-80 animate-pulse rounded-2xl bg-[var(--platform-subtle)]" />
        }
      >
        <SettingsContent />
      </Suspense>
    </section>
  );
}

async function SettingsContent() {
  const { supabase, user } = await requireUser();

  const [{ data: profile, error: profileError }, settings] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_super_admin, full_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    getAgencySettings(),
  ]);
  if (profileError) throw new Error("Could not load workspace access.", { cause: profileError });

  if (!profile?.is_super_admin) {
    return (
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="platform-panel p-6"><ShieldCheck size={22} className="text-[var(--platform-muted)]" /><h2 className="mt-3 text-[15px] font-semibold">Your account</h2>
          <p className="mt-3 break-words text-sm font-medium">{profile?.full_name || profile?.email || user.email}</p>
          {profile?.full_name ? <p className="mt-1 break-all text-xs text-[var(--platform-muted)]">{profile.email || user.email}</p> : null}
          <p className="mt-4 text-sm leading-relaxed text-[var(--platform-muted)]">Your workspace branding and account access are managed by {settings.name}. Website permissions follow your role in each client account.</p>
        </section>
        <section className="platform-panel p-6"><LifeBuoy size={22} className="text-[var(--platform-muted)]" /><h2 className="mt-3 text-[15px] font-semibold">Here to help</h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--platform-muted)]">
          {settings.supportEmail ? (
            <>
              Need a change to your account or branding?{" "}
              <a
                href={`mailto:${settings.supportEmail}`}
                className="font-medium text-[var(--platform-accent)] hover:underline"
              >
                Contact support
              </a>
              .
            </>
          ) : (
            "Contact your account manager for changes to your workspace."
          )}
        </p>
        </section>
      </div>
    );
  }

  return <AgencySettingsForm settings={settings} action={updateAgencySettings} account={{ name: profile.full_name ?? "", email: profile.email ?? user.email ?? "" }} />;
}
