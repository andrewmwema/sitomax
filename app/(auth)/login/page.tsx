import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAgencySettings } from "@/lib/agency";
import { AuthCard } from "../auth-card";
import { LoginForm } from "./login-form";

/**
 * Email + password login, branded with the agency's settings.
 * Accounts are invite-only; there is no public sign-up.
 */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Suspense
        fallback={
          <div className="h-72 w-full max-w-sm animate-pulse rounded-2xl bg-[#EFEEEA]" />
        }
      >
        <LoginCard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginCard({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const [params, settings, supabase] = await Promise.all([
    searchParams,
    getAgencySettings(),
    createClient(),
  ]);

  const nextParam =
    typeof params.next === "string" && params.next.startsWith("/")
      ? params.next
      : "/dashboard";

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(nextParam);
  }

  const linkError = params.error === "link";

  return (
    <AuthCard
      settings={settings}
      title={`Sign in to ${settings.name}`}
      subtitle="Enter your email and password to continue."
    >
      {linkError && (
        <p
          className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          That link is invalid or has expired. Sign in below or request a new
          password reset.
        </p>
      )}
      <LoginForm next={nextParam} />
    </AuthCard>
  );
}
