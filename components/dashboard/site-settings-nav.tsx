import Link from "next/link";

export function SiteSettingsNav({ siteId, current, canManageDomains }: {
  siteId: string;
  current: "pages" | "blog" | "seo" | "domains" | "leads";
  canManageDomains: boolean;
}) {
  const links = [
    { key: "pages", label: "Pages", href: `/dashboard/sites/${siteId}` },
    { key: "blog", label: "Blog", href: `/dashboard/sites/${siteId}/blog` },
    { key: "seo", label: "SEO", href: `/dashboard/sites/${siteId}/seo` },
    ...(canManageDomains ? [{ key: "domains", label: "Domains", href: `/dashboard/sites/${siteId}/domains` }] : []),
    ...(canManageDomains ? [{ key: "leads", label: "Leads", href: `/dashboard/sites/${siteId}/leads` }] : []),
  ];
  return <nav aria-label="Site settings" className="platform-tabs">
    {links.map(({ key, label, href }) => <Link key={key} href={href} aria-current={key === current ? "page" : undefined}>
      {label}
    </Link>)}
  </nav>;
}
