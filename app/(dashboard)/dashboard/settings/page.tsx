import { Suspense } from "react";
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
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Branding and workspace preferences.
        </p>
      </header>
      <Suspense
        fallback={
          <div className="h-80 max-w-xl animate-pulse rounded-2xl bg-zinc-200" />
        }
      >
        <SettingsContent />
      </Suspense>
    </section>
  );
}

async function SettingsContent() {
  const { supabase, user } = await requireUser();

  const [{ data: profile }, settings] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
    getAgencySettings(),
  ]);

  if (!profile?.is_super_admin) {
    return (
      <div className="max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="font-medium text-zinc-900">
          Your workspace is managed by {settings.name}
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          {settings.supportEmail ? (
            <>
              Need a change to your account or branding?{" "}
              <a
                href={`mailto:${settings.supportEmail}`}
                className="font-medium text-primary hover:underline"
              >
                Contact support
              </a>
              .
            </>
          ) : (
            "Contact your account manager for changes to your workspace."
          )}
        </p>
      </div>
    );
  }

  return <AgencySettingsForm settings={settings} action={updateAgencySettings} />;
}
