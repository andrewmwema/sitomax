import { Suspense, type CSSProperties } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAgencySettings } from "@/lib/agency";
import { LoginForm } from "./login-form";

/**
 * Magic-link login, branded with the agency's settings.
 */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-zinc-950">
      <Suspense
        fallback={
          <div className="h-72 w-full max-w-sm animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
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
    <div
      style={{ "--primary": settings.primaryColor } as CSSProperties}
      className="w-full max-w-sm"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {settings.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote logo host is user-configured
          <img
            src={settings.logoUrl}
            alt={settings.name}
            className="h-12 w-auto"
          />
        ) : (
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-white">
            {settings.name.charAt(0).toUpperCase()}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Sign in to {settings.name}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Enter your email and we&apos;ll send you a secure sign-in link.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {linkError && (
          <p
            className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
            role="alert"
          >
            That sign-in link is invalid or has expired. Request a new one
            below.
          </p>
        )}
        <LoginForm next={nextParam} />
      </div>

      {settings.supportEmail && (
        <p className="mt-6 text-center text-sm text-zinc-500">
          Need help?{" "}
          <a
            href={`mailto:${settings.supportEmail}`}
            className="font-medium text-primary hover:underline"
          >
            Contact support
          </a>
        </p>
      )}
    </div>
  );
}
