"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSiteUrl } from "@/lib/site-url";
import { brand } from "@/lib/brand";
import { ArrowUpRight, Pencil } from "lucide-react";

export type SiteCardSite = {
  id: string; name: string | null; subdomain: string; custom_domain: string | null; domain_verified: boolean;
  accountName: string | null;
  canManageDomains: boolean;
  pages: { id: string; slug: string; published_at: string | null }[];
  placeholderCount: number;
};

export function SiteCard({ site, marketingSubdomain }: { site: SiteCardSite; marketingSubdomain: string }) {
  const url = getSiteUrl(site, marketingSubdomain);
  const homePage = site.pages.find((page) => page.slug === "") ?? site.pages[0] ?? null;
  const live = Boolean(site.pages.find((page) => page.slug === "")?.published_at);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const preview = `${brand.appUrl}/s/${site.subdomain}${homePage?.slug ? `/${homePage.slug}` : ""}?preview=1`;
  return <article className="platform-panel platform-site-card overflow-hidden">
    <div ref={ref} className="platform-site-preview relative overflow-hidden bg-[#EFEEEA]">
      {homePage && width > 0 ? <iframe title={`Preview of ${site.name || site.subdomain}`} src={preview} loading="lazy"
        sandbox="" scrolling="no" tabIndex={-1} className="pointer-events-none absolute top-0 left-0 border-0"
        style={{ width: 1280, height: 800, transform: `scale(${width / 1280})`, transformOrigin: "top left" }} /> : null}
      <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold shadow-sm ${live ? "text-emerald-700" : "text-[#5F5E5A]"}`}>
        <span className={`size-1.5 rounded-full ${live ? "bg-emerald-600" : "bg-[#A8A7A2]"}`} />{live ? "Live" : "Draft"}
      </span>
    </div>
    <div className="p-5">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0">
        <h3 className="truncate text-[15px] font-semibold">{site.name ?? site.subdomain}</h3>
        <a href={url} target="_blank" rel="noreferrer" className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[#6B6A66] hover:text-[#121212]"><span className="truncate">{url.replace(/^https?:\/\//, "")}</span><ArrowUpRight size={12} className="shrink-0" /></a>
        {site.custom_domain && !site.domain_verified ? <span className="text-xs text-amber-700">Custom domain pending</span> : null}
      </div></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#F0EFEA] pt-4">
        <span className="text-xs text-[#6B6A66]">{site.accountName ? `${site.accountName} · ` : ""}{site.placeholderCount} {site.placeholderCount === 1 ? "section with placeholders" : "sections with placeholders"}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/sites/${site.id}`} className="platform-button">Pages</Link>
          {site.canManageDomains ? <Link href={`/dashboard/sites/${site.id}/domains`} className="platform-button">
            {site.custom_domain ? "Domains" : "Connect domain"}
          </Link> : null}
          {homePage ? <Link href={`/editor/${homePage.id}`} className="platform-button platform-button-primary"><Pencil size={12} />Edit</Link> :
            <span className="text-xs text-[#6B6A66]">No pages yet</span>}
        </div>
      </div>
    </div>
  </article>;
}
