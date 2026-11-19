"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleCheck, Clock3, Globe2, ShieldCheck } from "lucide-react";
import type { DomainRequest } from "@/lib/domains/requests";
import { domainRequestLabels } from "@/lib/domains/requests";
import { getProvider } from "@/lib/domains/providers";
import { DomainRequestUpdate } from "./domain-request-update";
import { WorkspaceDialog } from "./workspace-dialog";
import { WorkspaceMetrics } from "./workspace-metrics";
import { TableScrollArea } from "./table-scroll-area";

export type ManagedDomainRequest = DomainRequest & {
  done_at: string | null;
  notification_sent_at: string | null;
  site: {
    name: string | null; subdomain: string; custom_domain: string | null; domain_verified: boolean;
    account: { name: string };
  };
};

function requestTone(status: DomainRequest["status"]) {
  return status === "done" ? "success" : status === "needs_info" ? "warning" : status === "in_progress" ? "accent" : undefined;
}

export function DomainRequestsWorkspace({ requests, initialPage = 1 }: { requests: ManagedDomainRequest[]; initialPage?: number }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(initialPage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRequest = requests.find((request) => request.id === selectedId);
  const visible = requests.filter((request) => (status === "all" || request.status === status) &&
    [request.domain, request.site.name, request.site.subdomain, request.site.account.name].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(visible.length / 25));
  const currentPage = Math.min(page, pageCount);
  const rows = visible.slice((currentPage - 1) * 25, currentPage * 25);
  const requested = requests.filter((request) => request.status === "requested").length;
  const needsInfo = requests.filter((request) => request.status === "needs_info").length;

  return <>
    <WorkspaceMetrics metrics={[
      { label: "Total requests", value: requests.length, detail: "Delegated domain setup", icon: Globe2 },
      { label: "Pending / action required", value: requested + needsInfo, detail: `${requested} requested · ${needsInfo} need information`, icon: Clock3 },
      { label: "In progress", value: requests.filter((request) => request.status === "in_progress").length, detail: "Setup is being worked on", icon: ShieldCheck },
      { label: "Completed requests", value: requests.filter((request) => request.status === "done").length, detail: "Administrative status, not verification", icon: CircleCheck },
    ]} />
    <div className="flex items-start gap-3 rounded-xl border border-[var(--platform-line)] bg-[var(--platform-surface)] p-4 text-xs leading-relaxed text-[var(--platform-secondary)]">
      <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[var(--platform-muted)]" />
      <p><strong className="font-semibold">Request completion and domain verification are separate.</strong> Marking Done emails the account owners; failed emails are retried by the scheduled domain job. Use limited DNS access only. Never collect registrar passwords or transfer codes.</p>
    </div>
    <section aria-label="Domain request directory" className="platform-panel overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--platform-line)] p-4">
        <label className="min-w-52 flex-1"><span className="sr-only">Search domain requests</span>
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search domain, website or client..." className="w-full border px-3 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs text-[var(--platform-muted)]">Request status
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="border px-3 text-sm">
            <option value="all">All statuses</option>{Object.entries(domainRequestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <p aria-live="polite" className="pb-3 text-xs text-[var(--platform-muted)]">{visible.length} {visible.length === 1 ? "request" : "requests"}</p>
      </div>
      {rows.length ? <TableScrollArea label="Domain setup requests"><table className="w-full min-w-[880px] text-left text-sm">
        <caption className="sr-only">Domain requests and DNS verification status</caption>
        <thead><tr>{["Domain", "Website / client", "Request status", "Domain connection", "Requested (UTC)", "Actions"].map((label) => <th key={label} className="px-5 font-medium">{label}</th>)}</tr></thead>
        <tbody>{rows.map((request) => {
          const verified = request.site.custom_domain === request.domain && request.site.domain_verified;
          return <tr key={request.id} className="align-top">
            <td className="px-5"><p className="font-medium">{request.domain}</p><p className="mt-1 text-xs text-[var(--platform-muted)]">{getProvider(request.provider).name}</p></td>
            <td className="px-5"><Link href={`/dashboard/sites/${request.site_id}/domains`} className="font-medium hover:underline">{request.site.name || request.site.subdomain}</Link><p className="mt-1 text-xs text-[var(--platform-muted)]">{request.site.account.name}</p></td>
            <td className="px-5"><span className="platform-status" data-tone={requestTone(request.status)}>{domainRequestLabels[request.status]}</span></td>
            <td className="px-5"><span className="platform-status" data-tone={verified ? "success" : "warning"}>{verified ? "Verified" : "Not verified"}</span></td>
            <td className="px-5 text-xs text-[var(--platform-muted)]">{new Date(request.created_at).toLocaleDateString("en", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</td>
            <td className="px-5">
              <button type="button" aria-haspopup="dialog" className="platform-button" onClick={() => setSelectedId(request.id)}>Review<span className="sr-only"> {request.domain}</span></button>
            </td>
          </tr>;
        })}</tbody>
      </table></TableScrollArea> : <div className="px-6 py-10 text-center"><Globe2 size={24} className="mx-auto text-[var(--platform-muted)]" />
        <h2 className="mt-3 text-sm font-semibold">{requests.length ? "No requests match these filters" : "No domain requests yet"}</h2>
        <p className="mt-2 text-sm text-[var(--platform-muted)]">{requests.length ? "Try another domain, client or status." : "Requests from your client websites will appear here."}</p>
        {!requests.length ? <Link href="/dashboard/sites" className="platform-button mt-4">Manage websites</Link> : null}
      </div>}
      {pageCount > 1 ? <nav aria-label="Domain request pagination" className="flex items-center justify-between gap-3 border-t border-[var(--platform-line)] px-5 py-3 text-xs">
        <button type="button" className="platform-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span className="text-[var(--platform-muted)]">Page {currentPage} of {pageCount}</span>
        <button type="button" className="platform-button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav> : null}
    </section>
    {selectedRequest ? <DomainRequestDetails request={selectedRequest} onClose={() => setSelectedId(null)} /> : null}
  </>;
}

function DomainRequestDetails({ request, onClose }: { request: ManagedDomainRequest; onClose: () => void }) {
  const verified = request.site.custom_domain === request.domain && request.site.domain_verified;
  return <WorkspaceDialog open onClose={onClose} title={request.domain} description="Domain setup request">
    <section><h3 className="platform-eyebrow">Request information</h3><dl className="mt-3 space-y-3 text-sm">
      <div className="flex justify-between gap-4"><dt className="text-[var(--platform-muted)]">Client</dt><dd className="text-right font-medium">{request.site.account.name}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-[var(--platform-muted)]">Website</dt><dd className="text-right">{request.site.name || request.site.subdomain}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-[var(--platform-muted)]">Provider</dt><dd className="text-right">{getProvider(request.provider).name}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-[var(--platform-muted)]">Requested (UTC)</dt><dd className="text-right">{new Date(request.created_at).toLocaleString("en", { timeZone: "UTC" })}</dd></div>
      {request.done_at ? <div className="flex justify-between gap-4"><dt className="text-[var(--platform-muted)]">Marked done (UTC)</dt><dd className="text-right">{new Date(request.done_at).toLocaleString("en", { timeZone: "UTC" })}</dd></div> : null}
    </dl></section>
    <section className="rounded-xl border border-[var(--platform-line)] bg-[var(--platform-ground)] p-4">
      <h3 className="text-sm font-semibold">Connection status</h3>
      <span className="platform-status mt-3" data-tone={verified ? "success" : "warning"}>{verified ? "Domain verified" : "Domain not verified"}</span>
      <p className="mt-3 text-sm leading-relaxed text-[var(--platform-secondary)]">{verified ? "This domain is assigned to the website and its stored verification status is confirmed." : "Review the required DNS records, complete the setup with the provider, then run verification on the website's Domains page."}</p>
      <Link href={`/dashboard/sites/${request.site_id}/domains`} className="platform-button mt-4">DNS records and verification<ArrowUpRight size={14} /></Link>
    </section>
    <section><h3 className="mb-3 text-sm font-semibold">Update the request</h3>
      <DomainRequestUpdate request={request} />
      <p className="mt-3 text-xs leading-relaxed text-[var(--platform-muted)]">Saving Done notifies the account owners but does not verify DNS or connect the domain.</p>
      {request.status === "done" ? <p className="mt-2 text-xs text-[var(--platform-muted)]">{request.notification_sent_at ? "Completion email sent." : "Completion email has not been sent yet. Failed deliveries are retried by the scheduled domain job."}</p> : null}
    </section>
  </WorkspaceDialog>;
}
