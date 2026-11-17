"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Globe } from "lucide-react";
import type { DomainSettingsState } from "@/lib/domains";
import { checkSiteDomain, connectSiteDomain, removeSiteDomain } from "@/app/(dashboard)/dashboard/sites/[siteId]/domains/actions";

export function DomainSettings({ siteId, initial }: { siteId: string; initial: DomainSettingsState }) {
  const [state, setState] = useState(initial);
  const [domain, setDomain] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const current = state.site?.custom_domain;
  const status = state.error ? "Needs attention" : state.connection?.status ?? "Pending";
  const color = status === "Connected" ? "bg-green-50 text-green-800" :
    status === "Needs attention" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800";

  function run(action: () => Promise<DomainSettingsState>) {
    startTransition(async () => {
      setState(await action());
      setConfirmRemove(false);
    });
  }

  return <section className="platform-panel space-y-6 p-5 sm:p-6" aria-busy={pending}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Globe size={20} className="shrink-0 text-zinc-500" />
        <h2 className="break-all font-semibold">{current || "Connect your domain"}</h2>
      </div>
      {current ? <span className={`rounded-full px-3 py-1 text-xs font-medium ${color}`}>{status}</span> : null}
    </header>
    {!current ? <form onSubmit={(event) => {
      event.preventDefault();
      run(() => connectSiteDomain(siteId, domain));
    }} className="space-y-3">
      <label className="block text-sm" htmlFor="custom-domain">Domain name</label>
      <div className="flex flex-wrap gap-3">
        <input id="custom-domain" name="domain" type="text" required autoCapitalize="none" autoCorrect="off"
          spellCheck={false} placeholder="example.com" value={domain} disabled={pending}
          onChange={(event) => setDomain(event.target.value)}
          aria-describedby="domain-hint" className="min-w-0 flex-1 rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm" />
        <button disabled={pending} className="platform-button platform-button-primary">{pending ? "Connecting..." : "Connect domain"}</button>
      </div>
      <p id="domain-hint" className="text-xs text-zinc-500">Use your own domain. The www version will redirect to the root, even if you enter www here.</p>
    </form> : <>
      <div>
        <h3 className="text-sm font-semibold">DNS instructions</h3>
        <p className="mt-1 text-sm text-zinc-600">At your domain provider, add or update these records. Remove conflicting A, AAAA or CNAME records for these names only.</p>
        <p className="mt-2 text-xs text-zinc-500">Names are shown in full. Most providers use @ for the root and www for its alias; others accept the full name.</p>
      </div>
      {state.connection?.records.length ? <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-[#E8E7E3] text-xs text-zinc-500">
            <th className="py-3 pr-4 font-medium">Type</th><th className="px-4 py-3 font-medium">Name</th><th className="py-3 pl-4 font-medium">Value</th>
          </tr></thead>
          <tbody>{state.connection.records.map((record) => <tr key={`${record.type}-${record.name}-${record.value}`} className="border-b border-[#E8E7E3]">
            <td className="py-3 pr-4 font-medium">{record.type}</td>
            <td className="px-4 py-3"><CopyValue value={record.name} label={`${record.type} record name`} /></td>
            <td className="py-3 pl-4"><CopyValue value={record.value} label={`${record.type} record value`} /></td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="text-sm text-zinc-600">DNS instructions are not available yet. Retry the connection to load them.</p>}
      {state.connection?.issue ? <p className="text-sm text-amber-800">{state.connection.issue}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(() => checkSiteDomain(siteId))}
          className="platform-button platform-button-primary">{pending ? "Working..." : "Check again"}</button>
        {status !== "Connected" ? <button type="button" disabled={pending}
          onClick={() => run(() => connectSiteDomain(siteId, current))} className="platform-button">Retry connection</button> : null}
        <button type="button" disabled={pending} onClick={() => setConfirmRemove(true)}
          className="platform-button text-red-700">Remove domain</button>
      </div>
      {confirmRemove ? <div className="rounded-xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm text-red-900">Disconnect {current} and its www alias? Your platform address will keep working.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => run(() => removeSiteDomain(siteId))} className="platform-button text-red-700">Confirm removal</button>
          <button type="button" disabled={pending} onClick={() => setConfirmRemove(false)} className="platform-button">Cancel</button>
        </div>
      </div> : null}
    </>}
    {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-sm text-zinc-600">{state.success}</p> : null}
    <p className="border-t border-[#E8E7E3] pt-4 text-sm text-zinc-500">DNS changes can take up to 48 hours.</p>
  </section>;
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError("");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setError("Could not copy. Select and copy the value manually.");
    }
  }
  return <div>
    <div className="flex items-start gap-2"><code className="min-w-0 break-all text-xs">{value}</code>
      <button type="button" onClick={copy} aria-label={`Copy ${label}`} className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-100">
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      {copied ? <span role="status" className="sr-only">Copied</span> : null}
    </div>
    {error ? <p role="alert" className="mt-1 text-xs text-red-700">{error}</p> : null}
  </div>;
}
