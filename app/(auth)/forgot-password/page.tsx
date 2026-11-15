import { Suspense } from "react";
import { getAgencySettings } from "@/lib/agency";
import { AuthCard } from "../auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

/**
 * Password reset request, branded with the agency's settings.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-zinc-950">
      <Suspense
        fallback={
          <div className="h-72 w-full max-w-sm animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        }
      >
        <ForgotPasswordCard />
      </Suspense>
    </main>
  );
}

async function ForgotPasswordCard() {
  const settings = await getAgencySettings();

  return (
    <AuthCard
      settings={settings}
      title="Reset your password"
      subtitle={"Enter your email and we'll send you a link to set a new password."}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
