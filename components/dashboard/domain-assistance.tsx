"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HandHelping, RefreshCw } from "lucide-react";
import { domainProviders, getProvider } from "@/lib/domains/providers";
import { delegationSteps, domainRequestLabels, type DomainAssistanceData } from "@/lib/domains/requests";
import { createDomainRequest } from "@/app/(dashboard)/dashboard/sites/[siteId]/domains/request-actions";

export function DomainAssistance({ siteId, domain, providerId, data }: {
  siteId: string; domain: string; providerId: string; data: DomainAssistanceData;
}) {
  const [open, setOpen] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const router = useRouter();
  return <section aria-label="Agency domain assistance" className="space-y-4 rounded-xl border border-[#E8E7E3] bg-[#F7F7F5] p-4">
    {data.canRequest ? <>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="platform-button">
        <HandHelping size={16} /> Have us connect it for you
      </button>
      <p className="text-sm text-zinc-600">Invite our team with limited delegated access and we will handle the DNS setup.</p>
      {open ? <AssistanceForm siteId={siteId} initialDomain={domain} initialProviderId={providerId} supportEmail={data.supportEmail} /> : null}
    </> : null}
    <p className="text-sm font-medium">We will never ask for your password.</p>
    <p className="text-xs text-zinc-500">Do not send passwords, recovery codes, API keys or transfer codes. Keep ownership and billing with you, and revoke our access once setup is complete.</p>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Setup requests</h3>
      <button type="button" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}
        className="flex items-center gap-1 text-xs text-[#4B3FE0] underline"><RefreshCw size={12} />Refresh request status</button>
    </div>
    {data.requests.length ? <ul className="divide-y divide-[#E8E7E3]">
      {data.requests.map((request) => <li key={request.id} className="space-y-2 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="break-all font-medium">{request.domain}</p><p className="mt-1 text-xs text-zinc-500">{getProvider(request.provider).name}</p></div>
          <span className={`rounded-full px-2.5 py-1 text-xs ${request.status === "done" ? "bg-green-50 text-green-800" :
            request.status === "needs_info" ? "bg-amber-50 text-amber-900" : "bg-white text-zinc-700"}`}>{domainRequestLabels[request.status]}</span>
        </div>
        {request.notes ? <p className="whitespace-pre-wrap break-words text-zinc-600">{request.notes}</p> : null}
      </li>)}
    </ul> : <p className="text-sm text-zinc-500">No setup requests yet.</p>}
    {data.isSuperAdmin ? <Link href="/dashboard/domain-requests" className="inline-block text-sm text-[#4B3FE0] underline">Manage domain requests</Link> : null}
  </section>;
}

function AssistanceForm({ siteId, initialDomain, initialProviderId, supportEmail }: {
  siteId: string; initialDomain: string; initialProviderId: string; supportEmail: string | null;
}) {
  const [providerId, setProviderId] = useState(initialProviderId);
  const [result, action, pending] = useActionState(createDomainRequest.bind(null, siteId), { error: "", success: "" });
  const control = "mt-2 w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm";
  return <form action={action} className="space-y-4 border-y border-[#E8E7E3] py-4">
    <label className="block text-sm">Domain to connect<input name="domain" required defaultValue={initialDomain} placeholder="example.com"
      autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={pending} className={control} /></label>
    <label className="block text-sm">Your domain provider<select name="provider" value={providerId}
      onChange={(event) => setProviderId(event.target.value)} disabled={pending} className={control}>
      {domainProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
    </select></label>
    {supportEmail ? <div className="rounded-lg border border-[#E8E7E3] bg-white p-3">
      <p className="text-xs text-zinc-500">Invite this agency email at your provider</p>
      <p className="mt-1 select-all break-all text-sm font-semibold">{supportEmail}</p>
    </div> : <p role="alert" className="text-sm text-amber-900">Your agency must configure its support email before you can invite us. Please contact your account manager.</p>}
    <ol className="list-decimal space-y-3 pl-5 text-sm text-zinc-600">
      {delegationSteps(providerId).map((instruction) => <li key={instruction} className="pl-1">{instruction}</li>)}
    </ol>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="invited" required disabled={pending || !supportEmail} className="mt-1" />
      I have sent a limited-access invitation to the agency email above.</label>
    <button disabled={pending || !supportEmail} className="platform-button platform-button-primary">{pending ? "Submitting..." : "Request agency setup"}</button>
    {result.error ? <p role="alert" className="text-sm text-red-700">{result.error}</p> : null}
    {result.success ? <p role="status" className="text-sm text-zinc-600">{result.success}</p> : null}
  </form>;
}
