"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  superAdminOnly?: boolean;
};

const iconProps = {
  className: "size-5",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Sites",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </svg>
    ),
  },
  {
    href: "/dashboard/clients",
    label: "Clients",
    superAdminOnly: true,
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2" />
      </svg>
    ),
  },
  {
    href: "/dashboard/forms",
    label: "Forms",
    icon: (
      <svg {...iconProps}>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
      </svg>
    ),
  },
  {
    href: "/dashboard/ai-usage",
    label: "AI costs",
    superAdminOnly: true,
    icon: (
      <svg {...iconProps}>
        <path d="M12 3v18M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1z" />
      </svg>
    ),
  },
];

export function Sidebar({
  agencyName,
  logoUrl,
  isSuperAdmin,
  userEmail,
  signOutAction,
}: {
  agencyName: string;
  logoUrl: string | null;
  isSuperAdmin: boolean;
  userEmail: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter(
    (item) => !item.superAdminOnly || isSuperAdmin,
  );

  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-zinc-200 bg-white md:w-64">
      <div className="flex items-center gap-3 px-3 py-5 md:px-5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote logo host is user-configured
          <img
            src={logoUrl}
            alt={agencyName}
            className="size-9 shrink-0 rounded-lg object-contain"
          />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            {agencyName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="hidden truncate text-sm font-semibold tracking-tight md:block">
          {agencyName}
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 md:px-3">
        {items.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              {item.icon}
              <span className="hidden md:block">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 px-3 py-4 md:px-5">
        <p
          className="hidden truncate text-xs text-zinc-500 md:block"
          title={userEmail}
        >
          {userEmail}
        </p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
          >
            <svg {...iconProps} className="size-4">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span className="hidden md:block">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
