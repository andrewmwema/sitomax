"use client";

import { useActionState } from "react";
import type { DomainRequest } from "@/lib/domains/requests";
import { domainRequestLabels } from "@/lib/domains/requests";
import { updateDomainRequest } from "@/app/(dashboard)/dashboard/domain-requests/actions";

export function DomainRequestUpdate({ request }: { request: DomainRequest }) {
  const [result, action, pending] = useActionState(updateDomainRequest.bind(null, request.id), { error: "", success: "" });
  return <form action={action} className="space-y-3">
    <label className="block text-xs text-zinc-500">Status<select name="status" defaultValue={request.status} disabled={pending}
      className="mt-1 block w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm">
      {Object.entries(domainRequestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <label className="block text-xs text-zinc-500">Client-visible update (no passwords or other secrets)
      <textarea name="notes" defaultValue={request.notes} rows={2} maxLength={1000} disabled={pending}
        className="mt-1 block w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm" />
    </label>
    <button disabled={pending} className="platform-button">{pending ? "Saving..." : "Save update"}</button>
    {result.error ? <p role="alert" className="text-xs text-red-700">{result.error}</p> : null}
    {result.success ? <p role="status" className="text-xs text-zinc-600">{result.success}</p> : null}
  </form>;
}
