"use client";

import { lazy, Suspense, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Globe2, LayoutTemplate, LoaderCircle } from "lucide-react";
import { checkSubdomain, createSite } from "@/app/(dashboard)/dashboard/sites/new/actions";
import { createSiteCreationSchema, createSubdomainSchema, type SiteCreationInput } from "@/lib/site-creation";
import type { SectionDesign } from "@/lib/sections/catalog";
import type { SiteTheme } from "@/lib/theme/presets";
import { creationInputClass as inputClass, SiteCreationShell } from "./site-creation-shell";

const DesignThumbnail = lazy(() => import("@/components/editor/design-thumbnail").then((module) => ({ default: module.DesignThumbnail })));
const steps = [
  { title: "Client", description: "Choose who this site belongs to." },
  { title: "Template", description: "Find the right foundation for the business." },
  { title: "Business details", description: "Personalize the content and choose a site address." },
  { title: "Review & create", description: "Check the details before your new site goes live." },
] as const;

type Choice = { key: string; name: string; theme: SiteTheme; design: SectionDesign };
type FormValues = Omit<SiteCreationInput, "template"> & { template: string };
const initial: FormValues = {
  accountId: "", template: "", subdomain: "", businessName: "", phone: "",
  city: "", services: "", email: "", address: "",
  timezone: typeof window === "undefined" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
};

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
  const selectedTemplate = choices.find((choice) => choice.key === values.template);
  const selectedAccount = accounts.find((account) => account.id === values.accountId);
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
  const advance = () => {
    if (step === 0 && !values.accountId) { setError("Choose an account for this site."); return; }
    if (step === 1 && !values.template) { setError("Choose a template to continue."); return; }
    if (step === 2) {
      const parsed = siteCreationSchema.safeParse(values);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your site details."); return; }
      if (!availability?.available) { setError("Check that the subdomain is available before continuing."); return; }
    }
    setError(""); setStep(step + 1);
  };
  return <form className="site-creation" aria-label="Create a site from a template" onSubmit={(event) => {
    event.preventDefault();
    if (step < steps.length - 1) advance();
    else submit();
  }}>
    <SiteCreationShell steps={steps} step={step} mode="template" summary={<dl className="space-y-4">
      <div><dt>Client account</dt><dd>{selectedAccount?.name ?? "Not selected yet"}</dd></div>
      <div><dt>Selected template</dt><dd>{selectedTemplate?.name ?? "Find your starting point"}</dd></div>
      {values.businessName ? <div><dt>Business</dt><dd>{values.businessName}</dd></div> : null}
    </dl>}>
    <fieldset disabled={pending} className="creation-fields">
    {step === 0 ? <>
      <label className="flex flex-col gap-2 text-sm font-medium">
      Client account
      <select required className={inputClass} value={values.accountId} onChange={(event) => set("accountId", event.target.value)}>
        <option value="">Choose an account</option>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>
      <span className="creation-hint font-normal">The site, leads and analytics will belong to this account.</span>
    </label>
    <div className="creation-callout"><LayoutTemplate size={18} aria-hidden="true" /><p>Start with a curated design, then personalize it with the business name, services and contact details. You can customize the layout in the visual editor after creation.</p></div>
    </> : null}
    {step === 1 ? <fieldset>
      <legend className="creation-section-title">Choose a starting design</legend>
      <p className="creation-hint mb-5">Look for a style that fits. Colors, content and sections can all be changed later.</p>
      <div className="creation-options">
        {choices.map((choice) => <label key={choice.key} className="creation-template">
          <div inert aria-hidden="true" className="pointer-events-none">
            <Suspense fallback={<div className="creation-template-preview" />}><DesignThumbnail design={choice.design} theme={choice.theme} /></Suspense>
          </div>
          <span className="creation-template-caption">
            <span className="flex items-center gap-2"><input type="radio" required name="template" checked={values.template === choice.key}
              onChange={() => set("template", choice.key)} />{choice.name}</span>
            {values.template === choice.key ? <Check size={17} className="text-[var(--platform-accent)]" aria-hidden="true" /> : <LayoutTemplate size={16} className="text-[var(--platform-muted)]" aria-hidden="true" />}
          </span>
        </label>)}
      </div>
    </fieldset> : null}
    {step === 2 ? <>
    <div className="creation-field-grid">
      {fields.map(({ key, label, type }) => <label key={key} className="flex flex-col gap-2 text-sm font-medium">
        {label}<input className={inputClass} type={type ?? "text"} value={values[key]} required
          maxLength={key === "services" ? 300 : key === "phone" ? 40 : key === "email" ? 254 : key === "address" ? 200 : 100}
          autoComplete={key === "businessName" ? "organization" : key === "phone" ? "tel" : key === "email" ? "email" : key === "address" ? "street-address" : key === "city" ? "address-level2" : "off"}
          onChange={(event) => set(key, event.target.value)} />
      </label>)}
    </div>
      <label className="creation-section flex flex-col gap-2 text-sm font-medium">
        Site address
        <span className="creation-hint font-normal">Start with a subdomain. A custom domain can be connected later.</span>
        <span className="creation-url">
          <Globe2 size={16} className="ml-3 shrink-0" aria-hidden="true" />
          <input aria-label="Subdomain" className={inputClass} value={values.subdomain} onChange={(event) => {
            setAvailability(null); set("subdomain", event.target.value.toLowerCase());
          }} required maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoCapitalize="none" spellCheck={false} />
          <span className="shrink-0 font-normal">.{rootDomain}</span>
        </span>
        {values.subdomain ? <span role="status" className={`text-xs font-normal ${availability?.available ? "text-green-700" : "text-zinc-600"}`}>
          {availability?.message ?? (subdomainSchema.safeParse(values.subdomain).success ? "Checking availability..." : "Use letters, numbers and single hyphens; do not start or end with a hyphen.")}
        </span> : null}
        {availability && !availability.available && subdomainSchema.safeParse(values.subdomain).success ?
          <button type="button" className="w-fit text-xs underline" onClick={() => { setAvailability(null); setCheckAttempt((count) => count + 1); }}>Check again</button> : null}
      </label>
    </> : null}
    {step === 3 ? <>
      <dl className="creation-review">
        {[
          ["Client", selectedAccount?.name], ["Template", selectedTemplate?.name],
          ["Business", values.businessName], ["Location", values.city], ["Services", values.services],
          ["Contact", `${values.email}\n${values.phone}`], ["Address", values.address], ["Site address", `${values.subdomain}.${rootDomain}`],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <button type="button" className="w-fit text-sm font-medium text-[var(--platform-accent)] underline underline-offset-4" onClick={() => { setStep(2); setError(""); }}>Edit business details</button>
      <div className="creation-callout creation-callout-warning"><Globe2 size={18} aria-hidden="true" />
        <p><strong>Your site will be published immediately.</strong> Creating this site makes its four template pages available at {values.subdomain}.{rootDomain}. Review the content and replace sample images in the editor after creation.</p>
      </div>
    </> : null}
    </fieldset>
    {error ? <p role="alert" className="creation-error">{error}</p> : null}
    <footer className="creation-footer">
      <span className="creation-hint">{step === 3 ? "Ready when you are. Review before publishing." : "Your choices are kept as you move between steps."}</span>
      <div className="creation-footer-actions">
      {step > 0 ? <button type="button" disabled={pending} onClick={() => { setStep(step - 1); setError(""); }}
        className="creation-secondary"><ArrowLeft size={15} aria-hidden="true" />Back</button> : null}
      <button type="submit" className="creation-primary" disabled={pending || (step === 0 && !values.accountId) || (step === 1 && !values.template)}>
        {pending ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        {pending ? "Creating your site..." : step === 3 ? "Create and publish site" : "Continue"}
        {!pending ? <ArrowRight size={16} aria-hidden="true" /> : null}
      </button>
      </div>
    </footer>
    </SiteCreationShell>
  </form>;
}
