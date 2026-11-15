import Link from "next/link";
import { getSiteUrl } from "@/lib/tenant";

export type SiteCardSite = {
  id: string;
  name: string | null;
  subdomain: string;
  custom_domain: string | null;
  domain_verified: boolean;
  pages: { id: string; slug: string }[];
};

function DomainBadge({ site }: { site: SiteCardSite }) {
  if (site.custom_domain && site.domain_verified) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Domain live
      </span>
    );
  }
  if (site.custom_domain) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        <span className="size-1.5 rounded-full bg-amber-500" />
        Domain pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
      <span className="size-1.5 rounded-full bg-zinc-400" />
      Subdomain
    </span>
  );
}

export function SiteCard({ site }: { site: SiteCardSite }) {
  const url = getSiteUrl(site);
  const host = url.replace(/^https?:\/\//, "");
  const homePage =
    site.pages.find((page) => page.slug === "") ?? site.pages[0] ?? null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate font-semibold text-zinc-900">
          {site.name ?? site.subdomain}
        </h3>
        <DomainBadge site={site} />
      </div>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="truncate text-sm text-primary hover:underline"
      >
        {host}
      </a>

      <div className="mt-auto flex items-center gap-2 pt-2">
        {homePage ? (
          <Link
            href={`/editor/${homePage.id}`}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
          >
            Edit site
          </Link>
        ) : (
          <span className="cursor-not-allowed rounded-lg bg-zinc-100 px-3.5 py-2 text-sm font-medium text-zinc-400">
            No pages yet
          </span>
        )}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          View live
        </a>
      </div>
    </div>
  );
}
