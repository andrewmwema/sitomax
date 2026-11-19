"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, LayoutGrid, List, Pencil, Plus } from "lucide-react";
import { getSiteUrl } from "@/lib/site-url";
import { SiteCard, type SiteCardSite } from "./site-card";

type StatusFilter = "all" | "live" | "draft";
type SortOrder = "recent" | "name";
type ViewMode = "grid" | "list";
const VIEW_STORAGE_KEY = "sitomax-sites-view";
let memoryView: ViewMode = "grid";
const viewListeners = new Set<() => void>();

function getViewSnapshot(): ViewMode {
  try {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "grid" || saved === "list") return saved;
  } catch {
    return memoryView;
  }
  return memoryView;
}

function subscribeToView(listener: () => void) {
  viewListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    viewListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function saveView(view: ViewMode) {
  memoryView = view;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Keep the selected view in memory when browser storage is unavailable.
  }
  viewListeners.forEach((listener) => listener());
}

export function SiteGrid({
  sites, marketingSubdomain, initialFilter = "all",
}: { sites: SiteCardSite[]; marketingSubdomain: string; initialFilter?: StatusFilter }) {
  const [filter, setFilter] = useState<StatusFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [client, setClient] = useState("all");
  const [sort, setSort] = useState<SortOrder>("recent");
  const view = useSyncExternalStore(subscribeToView, getViewSnapshot, () => "grid");

  const clients = useMemo(() => [...new Map(sites.flatMap((site) => site.accountName
    ? [[site.accountId ?? site.accountName, site.accountName] as const]
    : [])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [sites]);
  const visible = useMemo(() => sites.filter((site) => {
    const live = Boolean(site.pages.find((page) => page.slug === "")?.published_at);
    const matchesStatus = filter === "all" || (filter === "live" ? live : !live);
    const matchesSearch = `${site.name ?? ""} ${site.subdomain} ${site.custom_domain ?? ""} ${site.accountName ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesStatus && matchesSearch && (client === "all" || (site.accountId ?? site.accountName) === client);
  }).sort((a, b) => sort === "name"
    ? (a.name ?? a.subdomain).localeCompare(b.name ?? b.subdomain)
    : (b.createdAt ?? "").localeCompare(a.createdAt ?? "")), [sites, filter, search, client, sort]);

  return <section aria-label="Website management" className="flex flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="platform-eyebrow">Workspace</p><h1 className="mt-1 text-[28px] font-semibold tracking-tight">Sites</h1>
        <p className="mt-1 text-sm text-[#6B6A66]">Create, manage, and publish websites across your workspace.</p></div>
      <Link href="/dashboard/sites/new" className="platform-button platform-button-primary"><Plus size={15} />New site</Link>
    </header>

    <div className="platform-panel flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-52 flex-1">
          <span className="sr-only">Search websites</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search websites..." className="w-full px-3 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-xs text-[#6B6A66]">Client
          <select aria-label="Filter by client" value={client} onChange={(event) => setClient(event.target.value)} className="px-3 text-sm">
            <option value="all">All clients</option>{clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-[#6B6A66]">Sort
          <select aria-label="Sort websites" value={sort} onChange={(event) => setSort(event.target.value as SortOrder)} className="px-3 text-sm">
            <option value="recent">Recently added</option><option value="name">Name A–Z</option>
          </select>
        </label>
        <div role="group" aria-label="Site view" className="flex rounded-lg border border-[#E8E7E3] p-1">
          <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => saveView("grid")} className={`rounded-md p-2 ${view === "grid" ? "bg-[#F1F0EC]" : ""}`}><LayoutGrid size={16} /></button>
          <button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => saveView("list")} className={`rounded-md p-2 ${view === "list" ? "bg-[#F1F0EC]" : ""}`}><List size={16} /></button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter sites" className="flex gap-0.5 rounded-xl border border-[#E8E7E3] bg-[#EFEEEA]/50 p-1">
          {([["all", "All"], ["live", "Live"], ["draft", "Drafts"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
            className={`rounded-lg px-3.5 py-2 text-xs ${filter === value ? "bg-white font-medium shadow-sm" : "text-[#5F5E5A]"}`}>{label}</button>)}
        </div>
        <p aria-live="polite" className="text-xs text-[#6B6A66]">{visible.length} {visible.length === 1 ? "website" : "websites"}</p>
      </div>
    </div>

    {visible.length ? view === "grid" ?
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{visible.map((site) => <SiteCard key={site.id} site={site} marketingSubdomain={marketingSubdomain} />)}</div> :
      <div className="platform-panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr><th className="px-5">Website</th><th className="px-4">Client</th><th className="px-4">Status</th><th className="px-4">Domain</th><th className="px-4">Added</th><th className="px-5 text-right">Actions</th></tr></thead>
          <tbody>{visible.map((site) => {
            const home = site.pages.find((page) => page.slug === "") ?? site.pages[0];
            const live = Boolean(site.pages.find((page) => page.slug === "")?.published_at);
            const url = getSiteUrl(site, marketingSubdomain);
            return <tr key={site.id}>
              <td className="px-5"><Link href={`/dashboard/sites/${site.id}`} className="font-medium hover:underline">{site.name || site.subdomain}</Link></td>
              <td className="px-4 text-[#6B6A66]">{site.accountName ?? "—"}</td>
              <td className="px-4"><span className={`inline-flex items-center gap-1.5 text-xs ${live ? "text-emerald-700" : "text-[#6B6A66]"}`}><span className={`size-1.5 rounded-full ${live ? "bg-emerald-600" : "bg-[#A8A7A2]"}`} />{live ? "Live" : "Draft"}</span></td>
              <td className="px-4"><a href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-48 items-center gap-1 truncate text-[#5F5E5A] hover:underline">{url.replace(/^https?:\/\//, "")}<ArrowUpRight size={12} className="shrink-0" /></a></td>
              <td className="px-4 text-xs text-[#6B6A66]">{site.createdAt ? new Date(site.createdAt).toLocaleDateString("en", { timeZone: "UTC" }) : "—"}</td>
              <td className="px-5"><div className="flex justify-end gap-2">
                {home ? <Link href={`/editor/${home.id}`} aria-label={`Edit ${site.name || site.subdomain}`} className="platform-button"><Pencil size={13} />Edit</Link> : null}
                <Link href={`/dashboard/sites/${site.id}`} className="platform-button">Manage</Link>
                {site.canManageDomains ? <Link href={`/dashboard/sites/${site.id}/domains`} className="platform-button">Domains</Link> : null}
                <a href={url} target="_blank" rel="noreferrer" aria-label={`Visit ${site.name || site.subdomain}`} className="platform-button"><ExternalLink size={13} /></a>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      : <div className="platform-panel border-dashed p-10 text-center">
        <h2 className="font-semibold">{sites.length ? "No websites match these filters" : "Your workspace is ready for its first website"}</h2>
        <p className="mt-2 text-sm text-[#6B6A66]">{sites.length ? "Try a different search or filter." : "Create a site to start building your online presence."}</p>
        {!sites.length ? <Link href="/dashboard/sites/new" className="platform-button platform-button-primary mt-5"><Plus size={15} />New site</Link> : null}
      </div>}
  </section>;
}
