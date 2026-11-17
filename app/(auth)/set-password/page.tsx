import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getAgencySettings } from "@/lib/agency";
import { AuthCard } from "../auth-card";
import { SetPasswordForm } from "./set-password-form";

/**
 * Lets a signed-in user set a new password. Reached from password reset
 * emails and client invites (via /auth/callback?next=/set-password).
 */
export default function SetPasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Suspense
        fallback={
          <div className="h-72 w-full max-w-sm animate-pulse rounded-2xl bg-[#EFEEEA]" />
        }
      >
        <SetPasswordCard />
      </Suspense>
    </main>
  );
}

async function SetPasswordCard() {
  // Redirects to /login when not signed in (e.g. expired reset link).
  await requireUser();
  const settings = await getAgencySettings();

  return (
    <AuthCard
      settings={settings}
      title="Set your password"
      subtitle={`Choose a password for your ${settings.name} account.`}
    >
      <SetPasswordForm />
    </AuthCard>
  );
}
