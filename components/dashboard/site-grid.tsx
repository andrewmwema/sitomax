"use client";

import { useState } from "react";
import { SiteCard, type SiteCardSite } from "./site-card";

export function SiteGrid({ sites }: { sites: SiteCardSite[] }) {
  const [filter, setFilter] = useState<"All" | "Live" | "Drafts">("All");
  const visible = sites.filter((site) => {
    const live = Boolean(site.pages.find((page) => page.slug === "")?.published_at);
    return filter === "All" || (filter === "Live" ? live : !live);
  });
  return <section id="sites" className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Sites</h2>
      <div role="group" aria-label="Filter sites" className="flex gap-0.5 rounded-[10px] bg-[#EFEEEA] p-1">
        {(["All", "Live", "Drafts"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
          className={`rounded-lg px-3.5 py-2 text-xs ${filter === value ? "bg-white font-medium shadow-sm" : "text-[#5F5E5A]"}`}>{value}</button>)}
      </div>
    </div>
    {visible.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{visible.map((site) => <SiteCard key={site.id} site={site} />)}</div>
      : <p className="rounded-[14px] border border-dashed border-[#E8E7E3] bg-white p-8 text-sm text-[#6B6A66]">{sites.length ? "No sites match this filter." : "No sites yet."}</p>}
  </section>;
}
