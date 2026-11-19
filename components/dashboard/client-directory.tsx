"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, Users } from "lucide-react";
import { WorkspaceDialog } from "./workspace-dialog";
import { InviteOwnerForm } from "./invite-owner-form";
import { inviteOwner } from "@/app/(dashboard)/dashboard/clients/actions";

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

export function ClientDirectory({ accounts }: { accounts: ClientAccount[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
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
        <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search clients or owners..." className="w-full border py-2 pl-9 pr-3 text-sm" /></label>
      <label className="flex flex-col gap-1 text-xs text-[var(--platform-muted)]">Account access
        <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} className="border px-3 text-sm">
          <option value="all">All accounts</option><option value="owner">Owner assigned</option><option value="unassigned">Needs owner</option>
        </select>
      </label>
      <p aria-live="polite" className="pb-3 text-xs text-[var(--platform-muted)]">{visible.length} {visible.length === 1 ? "client" : "clients"}</p>
    </div>
    {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
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
            <WorkspaceDialog title={account.name} description="Client information, websites and account access." trigger={<>View client<span className="sr-only">: {account.name}</span></>}>
              <section><h3 className="platform-eyebrow">Client account</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-[var(--platform-muted)]">Joined (UTC)</dt><dd className="mt-1">{new Date(account.created_at).toLocaleDateString("en", { timeZone: "UTC" })}</dd></div>
                <div><dt className="text-xs text-[var(--platform-muted)]">Team members</dt><dd className="mt-1">{account.account_members.length}</dd></div>
              </dl></section>
              <section><h3 className="platform-eyebrow">Websites</h3>
                {account.sites.length ? <ul className="mt-2 divide-y divide-[var(--platform-line)]">{account.sites.map((site) => <li key={site.id}><Link href={`/dashboard/sites/${site.id}`} className="flex items-center justify-between gap-3 py-3 text-sm font-medium hover:underline">{site.name || site.subdomain}<ArrowUpRight size={14} /></Link></li>)}</ul> : <p className="mt-2 text-sm text-[var(--platform-muted)]">No websites assigned yet.</p>}
                <Link href="/dashboard/sites/new" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--platform-accent)] hover:underline">Create a website<ArrowUpRight size={13} /></Link>
              </section>
              <section><h3 className="platform-eyebrow">User access</h3>
                {account.account_members.length ? <ul className="mt-2 space-y-3">{account.account_members.map((member, index) => <li key={index} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">{member.profile?.full_name || member.profile?.email || "Profile unavailable"}
                    {member.profile?.full_name && member.profile.email ? <span className="mt-1 block text-xs text-[var(--platform-muted)]">{member.profile.email}</span> : null}</span>
                  <span className="platform-status capitalize">{member.role}</span>
                </li>)}</ul> : <p className="mt-2 text-sm text-[var(--platform-muted)]">Invite an owner to give this client access.</p>}
              </section>
              <section className="border-t border-[var(--platform-line)] pt-5"><h3 className="mb-3 text-sm font-semibold">Invite an account owner</h3><InviteOwnerForm accountId={account.id} action={inviteOwner} />
                <p className="mt-3 text-xs leading-relaxed text-[var(--platform-muted)]">Invitation delivery feedback appears here after sending. Acceptance status and invitation history are not currently tracked.</p>
              </section>
              <section className="rounded-xl border border-[var(--platform-line)] bg-[var(--platform-ground)] p-4"><h3 className="text-sm font-semibold">AI allowance</h3>
                {account.ai_limits ? <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt>Site generations / month</dt><dd className="font-medium tabular-nums">{account.ai_limits.monthly_site_generations}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Edits / month</dt><dd className="font-medium tabular-nums">{account.ai_limits.monthly_edits}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Extra credits</dt><dd className="font-medium tabular-nums">{account.ai_limits.extra_credits}</dd></div>
                </dl> : <p className="mt-2 text-sm text-[var(--platform-muted)]">No allowance configured.</p>}
                <Link href="/dashboard/ai-usage" className="mt-3 inline-block text-xs font-medium text-[var(--platform-accent)] hover:underline">Manage AI usage and allowances</Link>
              </section>
            </WorkspaceDialog>
          </td>
        </tr>;
      })}</tbody>
    </table></div> : <div className="px-6 py-10 text-center"><Users size={24} className="mx-auto text-[var(--platform-muted)]" />
      <h2 className="mt-3 text-sm font-semibold">{accounts.length ? "No clients match your search" : "Build your client workspace"}</h2>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">{accounts.length ? "Try another name, email or access filter." : "Add a client account, then invite an owner and create their first website."}</p>
    </div>}
    {pageCount > 1 ? <nav aria-label="Client pagination" className="flex items-center justify-between gap-3 border-t border-[var(--platform-line)] px-5 py-3 text-xs">
      <button type="button" className="platform-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
      <span className="text-[var(--platform-muted)]">Page {currentPage} of {pageCount}</span>
      <button type="button" className="platform-button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
    </nav> : null}
  </section>;
}
