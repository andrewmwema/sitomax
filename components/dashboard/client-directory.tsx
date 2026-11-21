"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { clientDirectoryHref, type ClientDirectoryFilters } from "@/lib/clients/directory";
import { TableScrollArea } from "./table-scroll-area";

export type ClientAccount = {
  id: string;
  name: string;
  created_at: string;
  account_members: {
    role: "owner" | "editor";
    profile: { email: string | null; full_name: string | null } | null;
  }[];
  sites: { id: string; name: string | null; subdomain: string }[];
  ai_limits: { monthly_site_generations: number; monthly_edits: number; extra_credits: number } | null;
};

export function ClientDirectory({ accounts, initialFilters = { q: "", access: "all", page: 1 } }: { accounts: ClientAccount[]; initialFilters?: ClientDirectoryFilters }) {
  const [search, setSearch] = useState(initialFilters.q);
  const [filter, setFilter] = useState(initialFilters.access);
  const [page, setPage] = useState(initialFilters.page);
  function updateFilters(next: ClientDirectoryFilters) {
    setSearch(next.q);
    setFilter(next.access);
    setPage(next.page);
    window.history.replaceState(null, "", clientDirectoryHref(next));
  }
  const visible = accounts.filter((account) => {
    const hasOwner = account.account_members.some((member) => member.role === "owner");
    const text = [account.name, ...account.account_members.flatMap(({ profile }) => [profile?.full_name, profile?.email])].join(" ").toLowerCase();
    return text.includes(search.trim().toLowerCase()) && (filter === "all" || (filter === "owner" ? hasOwner : !hasOwner));
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / 25));
  const currentPage = Math.min(page, pageCount);
  const rows = visible.slice((currentPage - 1) * 25, currentPage * 25);
  return <section aria-label="Client directory" className="platform-panel overflow-hidden">
    <div className="flex flex-wrap items-end gap-3 border-b border-[var(--platform-line)] p-4">
      <label className="relative min-w-48 flex-1"><span className="sr-only">Search clients</span><Search size={16} className="pointer-events-none absolute top-3.5 left-3 text-[var(--platform-muted)]" />
        <input type="search" maxLength={200} value={search} onChange={(event) => updateFilters({ q: event.target.value, access: filter, page: 1 })} placeholder="Search clients or owners..." className="w-full border py-2 pl-9 pr-3 text-sm" /></label>
      <label className="flex flex-col gap-1 text-xs text-[var(--platform-muted)]">Account access
        <select value={filter} onChange={(event) => {
          const access = event.target.value;
          if (access === "all" || access === "owner" || access === "unassigned") updateFilters({ q: search, access, page: 1 });
        }} className="border px-3 text-sm">
          <option value="all">All accounts</option><option value="owner">Owner assigned</option><option value="unassigned">Needs owner</option>
        </select>
      </label>
      <p aria-live="polite" className="pb-3 text-xs text-[var(--platform-muted)]">{visible.length} {visible.length === 1 ? "client" : "clients"}</p>
    </div>
    {visible.length ? <TableScrollArea label="Client accounts"><table className="w-full min-w-[760px] text-left text-sm">
      <caption className="sr-only">Client accounts and owner access</caption>
      <thead><tr>{["Client / business", "Account owner", "Websites", "Account access", "Joined", "Actions"].map((label) => <th key={label} className="px-5 font-medium">{label}</th>)}</tr></thead>
      <tbody>{rows.map((account) => {
        const owners = account.account_members.filter((member) => member.role === "owner");
        const owner = owners[0]?.profile;
        return <tr key={account.id} className="align-top">
          <td className="px-5"><div className="flex items-center gap-3"><span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--platform-line)] bg-[var(--platform-ground)] text-xs font-semibold">{account.name.slice(0, 2).toUpperCase()}</span>
            <span className="font-medium">{account.name}</span></div></td>
          <td className="px-5"><p>{owner?.full_name || owner?.email || (owners.length ? "Owner profile unavailable" : "Not assigned")}</p>
            {owner?.full_name && owner.email ? <p className="mt-1 text-xs text-[var(--platform-muted)]">{owner.email}</p> : null}
            {owners.length > 1 ? <p className="mt-1 text-xs text-[var(--platform-muted)]">+{owners.length - 1} more</p> : null}</td>
          <td className="px-5 tabular-nums">{account.sites.length}</td>
          <td className="px-5"><span className="platform-status" data-tone={owners.length ? "success" : "warning"}>{owners.length ? "Owner assigned" : "Needs owner"}</span></td>
          <td className="px-5 text-xs text-[var(--platform-muted)]">{new Date(account.created_at).toLocaleDateString("en", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</td>
          <td className="px-5">
            <Link href={clientDirectoryHref({ q: search, access: filter, page: currentPage }, account.id)} className="platform-button">
              View client<span className="sr-only">: {account.name}</span>
            </Link>
          </td>
        </tr>;
      })}</tbody>
    </table></TableScrollArea> : <div className="px-6 py-10 text-center"><Users size={24} className="mx-auto text-[var(--platform-muted)]" />
      <h2 className="mt-3 text-sm font-semibold">{accounts.length ? "No clients match your search" : "Build your client workspace"}</h2>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">{accounts.length ? "Try another name, email or access filter." : "Add a client account, then invite an owner and create their first website."}</p>
    </div>}
    {pageCount > 1 ? <nav aria-label="Client pagination" className="flex items-center justify-between gap-3 border-t border-[var(--platform-line)] px-5 py-3 text-xs">
      <button type="button" className="platform-button" disabled={currentPage === 1} onClick={() => updateFilters({ q: search, access: filter, page: currentPage - 1 })}>Previous</button>
      <span className="text-[var(--platform-muted)]">Page {currentPage} of {pageCount}</span>
      <button type="button" className="platform-button" disabled={currentPage === pageCount} onClick={() => updateFilters({ q: search, access: filter, page: currentPage + 1 })}>Next</button>
    </nav> : null}
  </section>;
}
