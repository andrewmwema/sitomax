import type { AgencySettings } from "@/lib/agency";
import { LockKeyhole } from "lucide-react";

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
    <div className="w-full max-w-[420px]">
      <div className="flex flex-col items-center gap-4 text-center">
        {settings.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote logo host is user-configured
          <img
            src={settings.logoUrl}
            alt={settings.name}
            className="h-12 w-auto"
          />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-xl font-semibold text-white shadow-[inset_0_1px_0_#ffffff26,0_6px_12px_#12121214]">
            {settings.name.charAt(0).toUpperCase()}
          </div>
        )}
        <p className="platform-eyebrow mt-2">{settings.name} workspace</p>
        <h1 className="text-[30px] leading-tight font-semibold tracking-[-1px] text-[#121212]">
          {title}
        </h1>
        <p className="max-w-80 text-sm leading-relaxed text-[#6B6A66]">{subtitle}</p>
      </div>

      <div className="platform-panel platform-auth-card mt-8 p-6 sm:p-8">
        {children}
      </div>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-[#6B6A66]"><LockKeyhole size={12} />Your private workspace. Access by invitation.</p>

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
