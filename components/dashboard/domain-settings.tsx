"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Globe, LoaderCircle, Mail } from "lucide-react";
import { customDomainSchema, domainChecksExpired, type DomainSettingsState, type DnsRecord } from "@/lib/domains";
import { domainProviders, getProvider } from "@/lib/domains/providers";
import {
  checkSiteDomain, connectSiteDomain, emailDomainInstructions, inspectSiteDomain, removeSiteDomain,
} from "@/app/(dashboard)/dashboard/sites/[siteId]/domains/actions";

const steps = ["Enter domain", "Choose provider", "Update DNS", "Go live"];
const control = "w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm";

export function DomainSettings({ siteId, initial }: { siteId: string; initial: DomainSettingsState }) {
  const [state, setState] = useState(initial);
  const [domain, setDomain] = useState(initial.site?.custom_domain ?? "");
  const [providerId, setProviderId] = useState(initial.site?.domain_provider ?? initial.inspection?.providerId ?? "other");
  const [step, setStep] = useState(initial.site?.domain_verified ? 4 : initial.site?.custom_domain ? 3 : 1);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const current = state.site?.custom_domain;
  const expired = state.site ? domainChecksExpired(state.site) : false;
  const live = Boolean(state.site?.domain_verified && state.connection?.status === "Connected");
  const provider = getProvider(providerId);
  const status = expired ? "Needs attention" : state.connection?.status ?? (state.error ? "Needs attention" : "Pending");

  function apply(result: DomainSettingsState) {
    setState((previous) => ({
      ...result,
      ...(result.site?.custom_domain === previous.site?.custom_domain ? {
        inspection: result.inspection ?? previous.inspection, conflicts: result.conflicts ?? previous.conflicts,
      } : {}),
    }));
    if (result.site?.domain_verified && result.connection?.status === "Connected") setStep(4);
  }
  function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => { try { await action(); } finally { busy.current = false; } });
  }

  useEffect(() => {
    if (!current || live || expired) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (busy.current || document.visibilityState === "hidden") return;
      busy.current = true;
      startTransition(async () => {
        try {
          const result = await checkSiteDomain(siteId, true);
          if (!cancelled) {
            setState((previous) => ({ ...result, ...(result.site?.custom_domain === previous.site?.custom_domain ? {
              inspection: result.inspection ?? previous.inspection, conflicts: result.conflicts ?? previous.conflicts,
            } : {}) }));
            if (result.site?.domain_verified && result.connection?.status === "Connected") setStep(4);
          }
        } finally { busy.current = false; }
      });
    }, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [siteId, current, live, expired]);

  async function detect() {
    const parsed = customDomainSchema.safeParse(domain);
    if (!parsed.success) { setState({ ...state, error: parsed.error.issues[0].message }); return; }
    const result = await inspectSiteDomain(siteId, parsed.data);
    setDomain(parsed.data);
    setProviderId(result.inspection?.providerId ?? "other");
    setState({ ...state, inspection: result.inspection, error: result.error, success: "" });
    setStep(2);
  }
  async function connect() {
    const result = await connectSiteDomain(siteId, domain, providerId);
    apply(result);
    if (result.site?.custom_domain) setStep(result.site.domain_verified ? 4 : 3);
  }
  async function check() { apply(await checkSiteDomain(siteId)); }

  return <section className="platform-panel space-y-6 p-5 sm:p-7" aria-busy={pending}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><Globe size={20} className="shrink-0 text-zinc-500" />
        <div><h2 className="font-semibold">Connect your domain</h2>{current ? <p className="mt-1 break-all text-sm text-zinc-500">{current}</p> : null}</div>
      </div>
      {current ? <span className={`rounded-full px-3 py-1 text-xs font-medium ${status === "Connected" ? "bg-green-50 text-green-800" :
        status === "Needs attention" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{status}</span> : null}
    </header>
    <ol aria-label="Connection progress" className="grid grid-cols-2 gap-3 border-y border-[#E8E7E3] py-4 sm:grid-cols-4">
      {steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}
        className={`flex items-center gap-2 text-xs ${step === index + 1 ? "font-semibold text-[#4B3FE0]" : "text-zinc-500"}`}>
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${step === index + 1 ? "bg-[#4B3FE0]/10" : "bg-zinc-100"}`}>
          {step > index + 1 ? <Check size={12} /> : index + 1}
        </span>{label}
      </li>)}
    </ol>
    {step === 1 ? <form onSubmit={(event) => { event.preventDefault(); run(detect); }} className="space-y-4">
      <div><h3 className="font-medium">What domain would you like to connect?</h3>
        <p id="domain-hint" className="mt-1 text-sm text-zinc-500">Enter your own domain. We will also connect www and redirect it to the root.</p></div>
      <label className="block text-sm" htmlFor="custom-domain">Domain name</label>
      <input id="custom-domain" name="domain" required autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder="example.com" value={domain} disabled={pending} onChange={(event) => setDomain(event.target.value)}
        aria-describedby="domain-hint" className={control} />
      <button disabled={pending} className="platform-button platform-button-primary">{pending ? "Finding your provider..." : "Continue"}</button>
    </form> : null}
    {step === 2 ? <div className="space-y-5">
      <div className="flex items-start gap-3">
        <ProviderLogo id={providerId} />
        <div><h3 className="font-medium">{state.inspection?.providerId === providerId && providerId !== "other"
          ? `We detected your domain is managed by ${provider.name}` : "Choose the company that manages your DNS"}</h3>
          <p className="mt-1 text-sm text-zinc-500">This may be different from the company where you bought your domain.</p>
        </div>
      </div>
      <label className="block space-y-2 text-sm"><span>Not right? Choose your provider</span>
        <select value={providerId} onChange={(event) => setProviderId(event.target.value)} disabled={pending} className={control}>
          {domainProviders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {state.inspection?.nameservers.length ? <p className="break-all text-xs text-zinc-500">Nameservers: {state.inspection.nameservers.join(", ")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(connect)} className="platform-button platform-button-primary">{pending ? "Preparing your records..." : "Show my DNS instructions"}</button>
        <button type="button" disabled={pending} onClick={() => current ? setStep(3) : setStep(1)} className="platform-button">Back</button>
      </div>
    </div> : null}
    {step === 3 ? <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><ProviderLogo id={providerId} /><h3 className="font-medium">Update your DNS with {provider.name}</h3></div>
        <button type="button" disabled={pending} onClick={() => setStep(2)} className="text-sm text-[#4B3FE0] underline">Change provider</button>
      </div>
      <ol className="list-decimal space-y-3 pl-5 text-sm text-zinc-600">
        {provider.steps.map((instruction) => <li key={instruction} className="pl-1">{instruction}</li>)}
      </ol>
      {provider.dnsUrl ? <a href={provider.dnsUrl} target="_blank" rel="noopener noreferrer" className="platform-button">
        Open {provider.name} DNS settings <ExternalLink size={14} />
      </a> : <p className="text-sm text-zinc-500">Open your domain provider&apos;s DNS management page in a separate tab.</p>}
      {state.conflicts?.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h4 className="text-sm font-semibold text-amber-900">Old website records found</h4>
        <p className="mt-1 text-sm text-amber-900">Replace only these conflicting website records when you are ready to move your site. Do not delete email (MX) or unrelated records.</p>
        <ul className="mt-3 space-y-2">{state.conflicts.map((record) => <li key={`${record.type}-${record.name}-${record.value}`} className="break-all font-mono text-xs text-amber-950">
          Delete this old record: {record.type} {record.name === current ? "@" : "www"} {record.value}
        </li>)}</ul>
      </div> : null}
      <div><h4 className="text-sm font-semibold">Exact records to add</h4>
        <p className="mt-1 text-xs text-zinc-500">Names are shown in full. Most providers use @ for the root and www for its alias. Leave email and unrelated records unchanged.</p>
        <DnsRecords records={state.connection?.records ?? []} />
      </div>
      <div className="rounded-xl border border-[#E8E7E3] bg-[#F7F7F5] p-4">
        {provider.videoUrl ? <a href={provider.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#4B3FE0] underline">Watch a short {provider.name} DNS guide</a>
          : <p className="text-xs text-zinc-500">Prefer a video? A short guide can be added here when one is available.</p>}
      </div>
      {current ? <SendInstructions siteId={siteId} providerId={providerId} /> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || !current} onClick={() => { setStep(4); run(check); }}
          className="platform-button platform-button-primary">I&apos;ve updated my DNS</button>
        <button type="button" disabled={pending} onClick={() => run(connect)} className="platform-button">Retry connection</button>
      </div>
    </div> : null}
    {step === 4 ? <div className="space-y-5">
      <div className={`rounded-2xl p-6 ${live ? "bg-green-50" : "bg-[#F7F7F5]"}`}>
        {live ? <Check size={26} className="text-green-700" /> : <LoaderCircle size={26} className={expired ? "text-amber-700" : "animate-spin text-[#4B3FE0]"} />}
        <h3 className="mt-4 text-lg font-semibold">{live ? "Your domain is live" : expired ? "Your domain needs attention" : "Waiting for your domain…"}</h3>
        <p className="mt-2 text-sm text-zinc-600">{live ? "Your website is connected. The www address redirects to your root domain." :
          expired ? "Automatic checking stopped after 14 days. Review the instructions or ask your agency for help. You can still check manually." :
            "We check every 30 seconds while this page is open, and every 15 minutes in the background. You can safely close this page."}</p>
        {live ? <a href={`https://${current}`} target="_blank" rel="noopener noreferrer" className="platform-button mt-4">Visit your website <ExternalLink size={14} /></a> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {!live ? <button type="button" disabled={pending} onClick={() => run(check)} className="platform-button platform-button-primary">{pending ? "Checking..." : "Check again"}</button> : null}
        <button type="button" disabled={pending} onClick={() => setStep(3)} className="platform-button">View DNS instructions</button>
      </div>
    </div> : null}
    {state.connection?.issue && step !== 2 ? <p className="text-sm text-amber-800">{state.connection.issue}</p> : null}
    {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-sm text-zinc-600">{state.success}</p> : null}
    <footer className="space-y-4 border-t border-[#E8E7E3] pt-4">
      <p className="text-sm text-zinc-500">DNS changes can take up to 48 hours.</p>
      {current ? <button type="button" disabled={pending} onClick={() => setConfirmRemove(true)} className="text-sm text-red-700 underline">Remove domain</button> : null}
      {confirmRemove ? <div className="rounded-xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm text-red-900">Disconnect {current} and its www alias? Your platform address will keep working.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => run(async () => {
            const result = await removeSiteDomain(siteId); apply(result); setConfirmRemove(false);
            if (!result.site?.custom_domain && !result.error) { setStep(1); setDomain(""); setProviderId("other"); }
          })} className="platform-button text-red-700">Confirm removal</button>
          <button type="button" disabled={pending} onClick={() => setConfirmRemove(false)} className="platform-button">Cancel</button>
        </div>
      </div> : null}
    </footer>
  </section>;
}

function ProviderLogo({ id }: { id: string }) {
  const { logo } = getProvider(id);
  return <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#E8E7E3] bg-white">
    {"path" in logo ? <svg viewBox="0 0 24 24" className="size-6" fill={`#${logo.hex}`}><path d={logo.path} /></svg>
      : <span className="text-[10px] font-semibold">{logo.initials}</span>}
  </span>;
}

function DnsRecords({ records }: { records: DnsRecord[] }) {
  if (!records.length) return <p className="mt-3 text-sm text-zinc-600">DNS instructions are not available yet. Retry the connection to load them.</p>;
  return <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
    <thead><tr className="border-b border-[#E8E7E3] text-xs text-zinc-500">
      <th className="py-3 pr-4 font-medium">Type</th><th className="px-4 py-3 font-medium">Name</th><th className="py-3 pl-4 font-medium">Value</th>
    </tr></thead>
    <tbody>{records.map((record) => <tr key={`${record.type}-${record.name}-${record.value}`} className="border-b border-[#E8E7E3]">
      <td className="py-3 pr-4 font-medium">{record.type}</td>
      <td className="px-4 py-3"><CopyValue value={record.name} label={`${record.type} record name`} /></td>
      <td className="py-3 pl-4"><CopyValue value={record.value} label={`${record.type} record value`} /></td>
    </tr>)}</tbody>
  </table></div>;
}

function SendInstructions({ siteId, providerId }: { siteId: string; providerId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [result, setResult] = useState({ error: "", success: "" });
  const [pending, startTransition] = useTransition();
  return <div>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="platform-button"><Mail size={15} /> Send these instructions to my web person</button>
    {open ? <form onSubmit={(event) => { event.preventDefault(); startTransition(async () => setResult(await emailDomainInstructions(siteId, email, providerId))); }}
      className="mt-4 space-y-3 rounded-xl border border-[#E8E7E3] p-4">
      <label className="block space-y-2 text-sm"><span>Their email address</span><input type="email" required maxLength={254} value={email}
        onChange={(event) => setEmail(event.target.value)} disabled={pending} className={control} /></label>
      <p className="text-xs text-zinc-500">We will send only the provider steps and DNS records. Only send to someone who is helping you connect this domain.</p>
      <button disabled={pending} className="platform-button platform-button-primary">{pending ? "Sending..." : "Send instructions"}</button>
      {result.error ? <p role="alert" className="text-sm text-red-700">{result.error}</p> : null}
      {result.success ? <p role="status" className="text-sm text-zinc-600">{result.success}</p> : null}
    </form> : null}
  </div>;
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setError(""); }
    catch (error) {
      if (!(error instanceof Error)) throw error;
      setError("Could not copy. Select and copy the value manually.");
    }
  }
  return <div><div className="flex items-start gap-2"><code className="min-w-0 break-all text-xs">{value}</code>
    <button type="button" onClick={copy} aria-label={`Copy ${label}`} className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-100">
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>{copied ? <span role="status" className="sr-only">Copied</span> : null}
  </div>{error ? <p role="alert" className="mt-1 text-xs text-red-700">{error}</p> : null}</div>;
}
