"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkSubdomain, createSite } from "@/app/(dashboard)/dashboard/sites/new/actions";
import { createSiteCreationSchema, createSubdomainSchema, type SiteCreationInput } from "@/lib/site-creation";
import type { SectionDesign } from "@/lib/sections/catalog";
import type { SiteTheme } from "@/lib/theme/presets";
import { DesignThumbnail } from "@/components/editor/design-thumbnail";

type Choice = { key: string; name: string; theme: SiteTheme; design: SectionDesign };
type FormValues = Omit<SiteCreationInput, "template"> & { template: string };
const initial: FormValues = {
  accountId: "", template: "", subdomain: "", businessName: "", phone: "",
  city: "", services: "", email: "", address: "",
  timezone: typeof window === "undefined" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
};
const inputClass = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-zinc-900";

export function NewSiteWizard({ accounts, choices, rootDomain, marketingSubdomain }: {
  accounts: { id: string; name: string; is_internal: boolean }[]; choices: Choice[]; rootDomain: string; marketingSubdomain: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const isInternal = accounts.some((account) => account.id === values.accountId && account.is_internal);
  const subdomainSchema = useMemo(() => createSubdomainSchema(marketingSubdomain, isInternal), [marketingSubdomain, isInternal]);
  const siteCreationSchema = useMemo(() => createSiteCreationSchema(marketingSubdomain, isInternal), [marketingSubdomain, isInternal]);
  const [step, setStep] = useState(0);
  const [availability, setAvailability] = useState<{ available: boolean; message: string } | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const set = (key: keyof FormValues, value: string) => {
    if (key === "accountId") setAvailability(null);
    setValues((previous) => ({ ...previous, [key]: value }));
    setError("");
  };
  useEffect(() => {
    const parsed = subdomainSchema.safeParse(values.subdomain);
    if (!parsed.success) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void checkSubdomain(parsed.data, values.accountId).then((result) => {
        if (active) setAvailability(result);
      }).catch((cause) => {
        console.error("Could not check subdomain", cause);
        if (active) setAvailability({ available: false, message: "Could not check availability. Please retry." });
      });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [values.subdomain, values.accountId, checkAttempt, subdomainSchema]);
  const submit = () => {
    const parsed = siteCreationSchema.safeParse(values);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your site details."); return; }
    if (!availability?.available) { setError("Check that the subdomain is available before creating the site."); return; }
    startTransition(async () => {
      try {
        const result = await createSite(parsed.data);
        if (result.status === "error") { setError(result.message); return; }
        router.push(`/dashboard/sites/${result.siteId}`);
      } catch (cause) {
        console.error("Unable to create site", cause);
        setError("Could not create the site. Please retry.");
      }
    });
  };
  const fields: { key: keyof Pick<FormValues, "businessName" | "phone" | "city" | "services" | "email" | "address">; label: string; type?: string }[] = [
    { key: "businessName", label: "Business name" }, { key: "phone", label: "Phone", type: "tel" },
    { key: "city", label: "City" }, { key: "services", label: "Services" },
    { key: "email", label: "Email", type: "email" }, { key: "address", label: "Address" },
  ];
  return <div className="platform-panel p-5 sm:p-8">
    <ol className="mb-7 flex flex-wrap gap-3 text-xs font-medium text-zinc-500" aria-label="Creation steps">
      {["Client", "Template", "Business details"].map((label, index) =>
        <li key={label} aria-current={step === index ? "step" : undefined} className={step === index ? "text-zinc-900" : ""}>{index + 1}. {label}</li>)}
    </ol>
    {step === 0 ? <label className="flex max-w-lg flex-col gap-2 text-sm font-medium">
      Account
      <select className={inputClass} value={values.accountId} onChange={(event) => set("accountId", event.target.value)}>
        <option value="">Choose an account</option>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>
    </label> : null}
    {step === 1 ? <fieldset>
      <legend className="mb-3 text-sm font-medium">Choose a template</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {choices.map((choice) => <label key={choice.key} className={`cursor-pointer overflow-hidden rounded-xl border-2 ${values.template === choice.key ? "border-zinc-900" : "border-zinc-200"}`}>
          <div inert aria-hidden="true" className="pointer-events-none"><DesignThumbnail design={choice.design} theme={choice.theme} /></div>
          <span className="flex items-center gap-2 p-3 text-sm font-medium">
            <input type="radio" name="template" checked={values.template === choice.key} onChange={() => set("template", choice.key)} />{choice.name}
          </span>
        </label>)}
      </div>
    </fieldset> : null}
    {step === 2 ? <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(({ key, label, type }) => <label key={key} className="flex flex-col gap-2 text-sm font-medium">
        {label}<input className={inputClass} type={type ?? "text"} value={values[key]} required onChange={(event) => set(key, event.target.value)} />
      </label>)}
      <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
        Subdomain
        <span className="flex flex-wrap items-center gap-1">
          <input className={`${inputClass} max-w-64`} value={values.subdomain} onChange={(event) => {
            setAvailability(null); set("subdomain", event.target.value.toLowerCase());
          }} required autoCapitalize="none" spellCheck={false} />
          <span className="font-normal text-zinc-500">.{rootDomain}</span>
        </span>
        {values.subdomain ? <span role="status" className={`text-xs font-normal ${availability?.available ? "text-green-700" : "text-zinc-600"}`}>
          {availability?.message ?? (subdomainSchema.safeParse(values.subdomain).success ? "Checking availability..." : "Use letters, numbers and single hyphens; do not start or end with a hyphen.")}
        </span> : null}
        {availability && !availability.available && subdomainSchema.safeParse(values.subdomain).success ?
          <button type="button" className="w-fit text-xs underline" onClick={() => { setAvailability(null); setCheckAttempt((count) => count + 1); }}>Check again</button> : null}
      </label>
      <p className="text-xs text-zinc-500 sm:col-span-2">The four pages will be published immediately. Review the site and replace sample images after creation. Contact forms cannot accept submissions until the forms feature is set up.</p>
    </div> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
    <div className="mt-7 flex gap-3">
      {step > 0 ? <button type="button" disabled={pending} onClick={() => { setStep(step - 1); setError(""); }}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50">Back</button> : null}
      {step < 2 ? <button type="button" disabled={step === 0 ? !values.accountId : !values.template}
        onClick={() => setStep(step + 1)} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Continue</button> :
        <button type="button" disabled={pending} onClick={submit} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          {pending ? "Creating..." : "Create and publish site"}
        </button>}
    </div>
  </div>;
}
