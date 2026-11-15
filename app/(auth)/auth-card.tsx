import type { CSSProperties } from "react";
import type { AgencySettings } from "@/lib/agency";

/**
 * Shared branded shell for the auth pages (login, forgot password,
 * set password): agency logo, title, card, and support footer.
 */
export function AuthCard({
  settings,
  title,
  subtitle,
  children,
}: {
  settings: AgencySettings;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
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
          {title}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {children}
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
