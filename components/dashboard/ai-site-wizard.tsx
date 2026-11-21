"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, Globe2, LoaderCircle, Sparkles } from "lucide-react";
import { z } from "zod";
import { createGenerationInputSchema, type GenerationInput } from "@/lib/ai/site-input";
import { DESIRED_SECTION_TYPES, GENERATION_PAGE_SLUGS, PRESET_PAGES, MAX_GENERATION_PAGES, extraPageCredits,
  generationOutcomeSchema, pageDetailsSchema, slugFromPageName, type GenerationResult } from "@/lib/ai/site-input";
import type { Business } from "@/lib/business";
import { businessDetailsChanged } from "@/lib/ai/site-business";
import { creationInputClass as fieldClass, SiteCreationShell } from "./site-creation-shell";

const steps = [
  { title: "Business", description: "Start with the facts that make this business unique." },
  { title: "Pages", description: "Choose the pages and sections your site needs." },
  { title: "Design", description: "Set a visual direction, or let AI take the lead." },
  { title: "Review & build", description: "Check your plan before creating editable drafts." },
] as const;
const stepFields: (keyof GenerationInput)[][] = [
  ["accountId", "businessName", "businessType", "city", "services", "difference", "tone", "openingHours", "phone", "email", "address", "description"],
  ["desiredPages", "pageDetails", "desiredSections"],
  ["style", "generationMode", "styleDirection", "fontDirection", "designDescription", "primaryColor", "secondaryColor"],
];
const sectionLabels: Record<(typeof DESIRED_SECTION_TYPES)[number], string> = {
  gallery: "Gallery", testimonials: "Testimonials", faq: "FAQ", pricing: "Pricing",
  team: "Team", process: "Process", logos: "Partner logos",
};
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), message: z.string() }),
  z.object({ type: z.literal("error"), message: z.string(),
    issues: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), code: z.string(), message: z.string(), received: z.string().max(40).optional() })).max(5).optional() }),
  z.object({ type: z.literal("result"), siteId: z.uuid(), pageId: z.uuid(), warnings: z.array(z.string()), pages: z.array(generationOutcomeSchema) }),
  z.object({ type: z.literal("retry"), page: generationOutcomeSchema }),
]);

export function AiSiteWizard({ accounts, existingSite, pendingRetries = [], rootDomain, marketingSubdomain, unlimited = true }: {
  accounts: { id: string; name: string; is_internal?: boolean }[];
  existingSite?: { id: string; accountId: string; name: string; business: Business; pages?: { slug: string; label: string; empty: boolean }[] };
  rootDomain: string;
  marketingSubdomain: string;
  unlimited?: boolean;
  pendingRetries?: GenerationResult["pages"];
}) {
  const router = useRouter();
  const [values, setValues] = useState<GenerationInput>({
    accountId: existingSite?.accountId ?? "", siteId: existingSite?.id, subdomain: existingSite ? undefined : "",
    businessName: existingSite?.business.businessName || existingSite?.name || "",
    businessType: existingSite?.business.businessType ?? "", city: existingSite?.business.city ?? "",
    services: existingSite?.business.services ?? [], difference: existingSite?.business.difference ?? "",
    tone: existingSite?.business.tone ?? "", openingHours: existingSite?.business.openingHours ?? "",
    style: "auto", generationMode: "catalog", styleDirection: "auto", fontDirection: "auto",
    designDescription: "", desiredPages: existingSite ? (existingSite.pages ?? []).filter(({ empty }) => empty).slice(0, MAX_GENERATION_PAGES).map(({ slug }) => slug)
      : [...GENERATION_PAGE_SLUGS], desiredSections: [],
    primaryColor: "", secondaryColor: "", phone: existingSite?.business.phone ?? "",
    email: existingSite?.business.email ?? "", address: existingSite?.business.address ?? "", description: "", confirmReplace: false,
    confirmBusinessUpdate: false, expectedBusiness: existingSite?.business,
  });
  const isInternal = accounts.some((account) => account.id === values.accountId && account.is_internal);
  const generationInputSchema = createGenerationInputSchema(marketingSubdomain, isInternal);
  const [service, setService] = useState("");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<NonNullable<Extract<z.infer<typeof eventSchema>, { type: "error" }>["issues"]>>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [custom, setCustom] = useState<{ name: string; purpose: string; slug: string } | null>(null);
  const choices = [
    ...(existingSite?.pages ?? []),
    ...PRESET_PAGES.filter(([slug]) => !existingSite?.pages?.some((page) => page.slug === slug))
      .map(([slug, label]) => ({ slug, label, empty: true })),
    ...(values.pageDetails ?? []).map(({ slug, name }) => ({ slug, label: name, empty: true })),
  ];
  const needsConfirmation = existingSite?.pages?.some(({ slug, empty }) => !empty && values.desiredPages.includes(slug));
  const changesBusiness = existingSite && businessDetailsChanged(values, existingSite.business);
  const set = <K extends keyof GenerationInput>(key: K, value: GenerationInput[K]) => {
    setValues((previous) => ({ ...previous, [key]: value })); setError("");
  };
  const addService = () => {
    const tag = service.trim();
    if (tag && values.services.length >= 20 && !values.services.includes(tag)) { setError("You can add up to 20 services."); return; }
    if (tag && values.services.length < 20 && !values.services.includes(tag)) set("services", [...values.services, tag]);
    setService("");
  };
  const generate = async (retryId?: string) => {
    const parsed = generationInputSchema.safeParse(values);
    if (!retryId && !parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your details."); return; }
    if (!retryId && needsConfirmation && !values.confirmReplace) { setError("Confirm that the selected drafts can be replaced."); return; }
    if (!retryId && changesBusiness && !values.confirmBusinessUpdate) { setError("Confirm the site-wide Business information update."); return; }
    setBusy(true); setError(""); setIssues([]); setMessages([retryId ? "Retrying page…" : "Planning your site…"]);
    let requestId: string | null = null;
    try {
      const response = await fetch("/api/ai/generate-site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(retryId ? { retryId } : parsed.data) });
      requestId = response.headers.get("X-Request-ID");
      if (!response.ok || !response.body) throw new Error("Could not start generation. Check your connection and sign-in.");
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = "", complete = false;
      const receive = (line: string) => {
        const event = eventSchema.parse(JSON.parse(line));
        if (event.type === "error") { setIssues(event.issues ?? []); throw new Error(event.message); }
        if (event.type === "progress") setMessages((previous) => previous.at(-1) === event.message ? previous : [...previous, event.message]);
        if (event.type === "result") {
          complete = true;
          setResult(event);
        }
        if (event.type === "retry") {
          complete = true;
          setResult((current) => current && ({ ...current, pages: current.pages.map((page) => page.retryId === retryId ? event.page : page) }));
        }
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
            if (line.trim()) receive(line);
          }
          if (done) break;
        }
        if (buffer.trim()) receive(buffer);
        if (!complete) throw new Error("The connection ended before confirmation. Check your drafts and contact your agency before retrying.");
      } finally { reader.releaseLock(); }
    } catch (cause) {
      console.error("Site generation did not complete", { requestId, type: cause instanceof Error ? cause.name : "Unknown" });
      const message = cause instanceof Error && !(cause instanceof z.ZodError) ? cause.message : "The progress response was invalid. Check your drafts before retrying.";
      setError(requestId ? `${message} Reference: ${requestId}` : message);
    } finally { setBusy(false); }
  };
  const summary = <dl className="space-y-4">
    <div><dt>Business</dt><dd>{values.businessName || "Your business, your starting point"}</dd></div>
    <div><dt>Site plan</dt><dd>{values.desiredPages.length} {values.desiredPages.length === 1 ? "page" : "pages"} selected</dd></div>
    <div><dt>Design approach</dt><dd>{values.generationMode === "custom" ? "Original custom layout" : "Curated section designs"}</dd></div>
  </dl>;
  const editorPageId = result?.pages.find((page) => page.built && page.pageId)?.pageId;
  const advance = () => {
    if (step === 1 && custom) { setError("Add or cancel your custom page before continuing."); return; }
    const tag = service.trim();
    const next = step === 0 && tag && !values.services.includes(tag) ? { ...values, services: [...values.services, tag] } : values;
    if (step === 0 && !next.services.length) { setError("Add at least one service."); return; }
    const parsed = generationInputSchema.safeParse(next);
    const issue = !parsed.success && parsed.error.issues.find(({ path }) => stepFields[step].some((field) => field === path[0]));
    if (issue) { setError(issue.message); return; }
    if (step === 0) { setValues(next); setService(""); }
    setError(""); setIssues([]); setStep(step + 1);
  };
  if (result) return <div className="site-creation">
    <SiteCreationShell steps={steps} step={3} mode="ai" summary={summary} title="Page generation summary"
      description="Your next step: review the draft, refine the details and make it your own.">
    <div className="creation-fields">
    <div className="creation-callout"><Check size={18} aria-hidden="true" /><p>Page layouts remain unpublished. Confirmed Business information changes apply site-wide, including live contact details. Review every page, placeholder and photo before publishing.</p></div>
    {result.warnings.length ? <ul role="status" className="my-4 list-disc space-y-2 pl-5 text-sm text-amber-900">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
    <ul className="space-y-3">{result.pages.map((page) => <li key={page.slug} className="creation-result-row text-sm">
      <span className="font-medium">{page.label}<span className={`mt-1 block text-xs font-normal ${page.built ? "text-green-700" : "text-amber-800"}`}>{page.built ? "Draft built" : "Not built — needs attention"}</span></span>
      {page.built && page.pageId ? <button type="button" className="creation-secondary" onClick={() => router.push(`/editor/${page.pageId}`)}>Open editor</button> : null}
      {!page.built && page.retryId ? <button type="button" disabled={busy} className="creation-secondary"
        onClick={() => void generate(page.retryId)}>Retry (free)</button> : null}
    </li>)}</ul>
    </div>
    {busy ? <p role="status" className="creation-progress">{messages.at(-1)}</p> : null}
    {error ? <p role="alert" className="creation-error">{error}</p> : null}
    <footer className="creation-footer"><span className="creation-hint">Failed-page retries are free. Nothing publishes automatically.</span>
      <div className="creation-footer-actions">
        {editorPageId ? <button type="button" className="creation-primary" onClick={() => router.push(`/editor/${editorPageId}`)}>
          Open site editor<ArrowRight size={15} aria-hidden="true" />
        </button> : null}
        <button type="button" className="creation-secondary" onClick={() => router.push(`/dashboard/sites/${result.siteId}`)}>Site overview<ArrowRight size={15} aria-hidden="true" /></button>
      </div>
    </footer>
    </SiteCreationShell>
  </div>;
  return <form className="site-creation" aria-label="Build a site with AI" onSubmit={(event) => {
    event.preventDefault();
    if (step < steps.length - 1) advance();
    else void generate();
  }}>
    <SiteCreationShell steps={steps} step={step} mode="ai" summary={summary}>
    <fieldset disabled={busy} className="creation-fields">
    {existingSite && pendingRetries.length ? <button type="button" className="mb-4 text-sm underline"
      onClick={() => setResult({ siteId: existingSite.id, pageId: pendingRetries[0].pageId!, warnings: [], pages: pendingRetries })}>
      Review unfinished pages and retry for free
    </button> : null}
      {step === 0 ? <div className="creation-field-grid">
        {!existingSite ? <label className="text-sm font-medium sm:col-span-2">Account
          <select required className={`${fieldClass} mt-2`} value={values.accountId} onChange={(event) => set("accountId", event.target.value)}>
            <option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label> : null}
        {([
          ["businessName", "Business name", true], ["businessType", "Business type", true], ["city", "City / area", true],
          ["phone", "Phone", false], ["email", "Email", false], ["address", "Address", false],
        ] as const).map(([key, label, required]) => <label key={key} className="text-sm font-medium">{label}
          <input required={required} maxLength={key === "address" ? 250 : key === "phone" ? 40 : key === "email" ? 254 : 100}
            type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} className={`${fieldClass} mt-2`}
            value={values[key]} onChange={(event) => set(key, event.target.value)} />
        </label>)}
        <div className="sm:col-span-2">
          <label htmlFor="ai-services" className="text-sm font-medium">Services</label>
          <div className="mt-2 flex gap-2"><input id="ai-services" maxLength={80} className={fieldClass} value={service}
            onChange={(event) => setService(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addService(); }
            }} placeholder="Add a service, then press Enter" />
            <button type="button" className="creation-secondary" disabled={!service.trim()} onClick={addService}>Add</button></div>
          <ul className="mt-2 flex flex-wrap gap-2">{values.services.map((tag) => <li key={tag}>
            <button type="button" aria-label={`Remove ${tag}`} className="creation-chip" onClick={() => set("services", values.services.filter((entry) => entry !== tag))}>{tag} &times;</button>
          </li>)}</ul>
        </div>
        <details className="creation-section sm:col-span-2">
          <summary className="creation-disclosure"><span>More business context<span className="creation-hint mt-1 block font-normal">Optional details to make the copy more personal.</span></span><ChevronDown size={16} aria-hidden="true" /></summary>
          <div className="creation-field-grid mt-5">
        <label className="text-sm font-medium sm:col-span-2">What makes you different?
          <textarea maxLength={1000} className={`${fieldClass} mt-2`} rows={2} value={values.difference} onChange={(event) => set("difference", event.target.value)} />
        </label>
        <label className="text-sm font-medium">Tone of voice
          <input maxLength={200} className={`${fieldClass} mt-2`} value={values.tone} onChange={(event) => set("tone", event.target.value)} />
        </label>
        <label className="text-sm font-medium">Opening hours
          <input maxLength={1000} className={`${fieldClass} mt-2`} value={values.openingHours} onChange={(event) => set("openingHours", event.target.value)} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">Describe your business
          <textarea maxLength={4000} className={`${fieldClass} mt-2`} rows={4} value={values.description} onChange={(event) => set("description", event.target.value)}
            placeholder="Who you help, what you do and any facts you want included. Do not include private customer information." />
        </label>
          </div>
        </details>
      </div> : null}
      {step === 1 ? <>
        <fieldset>
          <legend className="creation-section-title">Pages to build</legend>
          <div className="creation-options">
            {choices.map(({ slug, label, empty }) => <label key={slug} className="creation-option">
              <input type="checkbox" checked={values.desiredPages.includes(slug)}
                disabled={(!existingSite && !slug) || (!values.desiredPages.includes(slug) && values.desiredPages.length >= MAX_GENERATION_PAGES)}
                onChange={(event) => {
                  if (event.target.checked) set("desiredPages", [...values.desiredPages, slug]);
                  else setValues((previous) => ({ ...previous, desiredPages: previous.desiredPages.filter((page) => page !== slug),
                    pageDetails: previous.pageDetails?.filter((page) => page.slug !== slug) }));
                }} />
              <span>{label}{!empty ? " — Rebuild (replaces draft)" : ""}</span>
            </label>)}
          </div>
          <p className="creation-hint mt-3">{existingSite ? "Unselected drafts are left unchanged." : "Home is required."}
            {" "}Select up to 10 pages. Unfinished pages can be retried for free.</p>
          {custom ? <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="text-sm">Name<input className={fieldClass} value={custom.name} maxLength={80}
              onChange={(event) => setCustom({ ...custom, name: event.target.value,
                slug: custom.slug === slugFromPageName(custom.name) ? slugFromPageName(event.target.value) : custom.slug })} /></label>
            <label className="text-sm">Purpose<input className={fieldClass} value={custom.purpose} maxLength={180}
              onChange={(event) => setCustom({ ...custom, purpose: event.target.value })} /></label>
            <label className="text-sm">URL slug<input className={fieldClass} value={custom.slug} maxLength={60}
              onChange={(event) => setCustom({ ...custom, slug: event.target.value })} /></label>
            <button type="button" className="platform-button" onClick={() => {
              const parsed = pageDetailsSchema.safeParse(custom);
              if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the custom page details."); return; }
              if (choices.some(({ slug }) => slug === parsed.data.slug)) { setError("This page address is already in use."); return; }
              if (values.desiredPages.length >= MAX_GENERATION_PAGES) { setError("Select up to 10 pages."); return; }
              setValues((previous) => ({ ...previous, desiredPages: [...previous.desiredPages, parsed.data.slug],
                pageDetails: [...(previous.pageDetails ?? []), parsed.data] }));
              setCustom(null); setError("");
            }}>Add page</button>
            <button type="button" className="platform-button" onClick={() => setCustom(null)}>Cancel</button>
          </div> : <button type="button" className="platform-button mt-2" disabled={values.desiredPages.length >= MAX_GENERATION_PAGES}
            onClick={() => setCustom({ name: "", purpose: "", slug: "" })}>+ Add custom page</button>}
          {values.desiredPages.length > 1 ? <ol aria-label="Page order" className="mt-3 space-y-1 text-xs">
            {values.desiredPages.map((slug, index) => {
              const label = choices.find((page) => page.slug === slug)?.label ?? slug;
              const move = (offset: number) => {
                const next = [...values.desiredPages];
                [next[index], next[index + offset]] = [next[index + offset], next[index]];
                set("desiredPages", next);
              };
              return <li key={slug} className="creation-order-row">
                <span>{index + 1}. {label}</span>
                <span className="flex gap-1">
                <button type="button" className="inline-flex size-9 items-center justify-center rounded-md border disabled:opacity-30" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => move(-1)}><ArrowUp size={14} aria-hidden="true" /></button>
                <button type="button" className="inline-flex size-9 items-center justify-center rounded-md border disabled:opacity-30" aria-label={`Move ${label} down`} disabled={index === values.desiredPages.length - 1} onClick={() => move(1)}><ArrowDown size={14} aria-hidden="true" /></button>
                </span>
              </li>;
            })}
          </ol> : null}
          <p className="mt-2 text-sm">{unlimited ? "Agency: unlimited credits."
            : `Cost: one generation (10 shared credits if your allowance is used up)${extraPageCredits(values.desiredPages.length) ? ` + ${extraPageCredits(values.desiredPages.length)} shared credits for extra pages` : ""}. Failed-page retries are free.`}</p>
        </fieldset>
        <fieldset className="creation-section">
          <legend className="creation-section-title">Include these sections (optional)</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {DESIRED_SECTION_TYPES.map((section) => <label key={section} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={values.desiredSections.includes(section)}
                onChange={(event) => set("desiredSections", event.target.checked
                  ? [...values.desiredSections, section]
                  : values.desiredSections.filter((item) => item !== section))} />
              {sectionLabels[section]}
            </label>)}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Requested sections use only information you provided; missing facts stay placeholders.</p>
        </fieldset>
      </> : null}
      {step === 2 ? <div className="creation-field-grid">
        <fieldset className="sm:col-span-2">
          <legend className="creation-section-title">Design approach</legend>
          <div className="creation-options">
            {([
              ["catalog", "SitoMax designs", "A cohesive site built with curated section designs."],
              ["custom", "Original custom layout", "An original composition built from editable layout blocks."],
            ] as const).map(([mode, label, description]) => (
              <label key={mode} className="creation-option">
                <input type="radio" name="generationMode" value={mode} checked={values.generationMode === mode}
                  onChange={() => set("generationMode", mode)} />
                <span><span className="font-medium">{label}</span>
                <span className="creation-hint mt-1 block">{description}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-sm font-medium">Visual direction
          <select className={`${fieldClass} mt-2`} value={values.styleDirection} onChange={(event) => {
            const direction = z.enum(["auto", "minimal", "editorial", "bold", "organic", "premium", "playful"]).parse(event.target.value);
            set("styleDirection", direction);
          }}>
            <option value="auto">Let AI choose</option><option value="minimal">Minimal</option><option value="editorial">Editorial</option>
            <option value="bold">Bold</option><option value="organic">Organic</option><option value="premium">Premium</option><option value="playful">Playful</option>
          </select>
        </label>
        <label className="text-sm font-medium">Typography
          <select className={`${fieldClass} mt-2`} value={values.fontDirection} onChange={(event) => {
            const direction = z.enum(["auto", "serif", "sans"]).parse(event.target.value);
            set("fontDirection", direction);
          }}><option value="auto">Let AI choose</option><option value="serif">Serif headings</option><option value="sans">Sans-serif</option></select>
        </label>
        <label htmlFor="ai-design-guidance" className="text-sm font-medium sm:col-span-2">More design guidance (optional)
          <textarea id="ai-design-guidance" aria-describedby="ai-design-guidance-count ai-design-guidance-error"
            aria-invalid={values.designDescription.length > 5000}
            className={`${fieldClass} mt-2`} rows={3} value={values.designDescription}
            onChange={(event) => set("designDescription", event.target.value)}
            placeholder="Describe a mood, layout preference, or colors. Do not include private customer information." />
          <span id="ai-design-guidance-count" aria-live="polite" className="mt-1 block text-right text-xs text-zinc-500">
            {values.designDescription.length.toLocaleString()} / 5,000 characters
          </span>
          {values.designDescription.length > 5000 ? <span id="ai-design-guidance-error" role="alert" className="mt-1 block text-sm text-red-700">
            More design guidance is {values.designDescription.length - 5000} {values.designDescription.length - 5000 === 1 ? "character" : "characters"} over the 5,000-character limit. Shorten it before building your site.
          </span> : <span id="ai-design-guidance-error" className="sr-only">Maximum 5,000 characters.</span>}
        </label>
        <label className="text-sm font-medium sm:col-span-2">Design foundation
          <select className={`${fieldClass} mt-2`} value={values.style} onChange={(event) => {
            const style = z.enum(["classic", "modern", "auto"]).parse(event.target.value); set("style", style);
          }}><option value="auto">Let AI choose</option><option value="classic">Classic</option><option value="modern">Modern</option></select>
        </label>
        {(["primaryColor", "secondaryColor"] as const).map((key) => <label key={key} className="text-sm font-medium">{key === "primaryColor" ? "Primary" : "Secondary"} color (optional)
          <input className={`${fieldClass} mt-2`} value={values[key]} onChange={(event) => set(key, event.target.value)} placeholder="#1e3a5f" pattern="#[0-9a-fA-F]{6}" maxLength={7} />
        </label>)}
      </div> : null}
      {step === 3 ? <>
        <dl className="creation-review">
          <div><dt>Business</dt><dd>{values.businessName}</dd></div>
          <div><dt>Location</dt><dd>{values.city}</dd></div>
          <div><dt>Services</dt><dd>{values.services.join(", ")}</dd></div>
          <div><dt>Design</dt><dd>{values.generationMode === "custom" ? "Original custom layout" : "Curated sections"} · {values.styleDirection === "auto" ? "AI-chosen style" : values.styleDirection}</dd></div>
          <div><dt>Contact details</dt><dd>{[values.email, values.phone, values.address].filter(Boolean).join("\n") || "Not provided"}</dd></div>
          <div><dt>Brand colors</dt><dd>{[values.primaryColor, values.secondaryColor].filter(Boolean).join(" / ") || "Let AI choose"}</dd></div>
          <div className="sm:col-span-2"><dt>Pages, in order</dt><dd>{values.desiredPages.map((slug) => choices.find((page) => page.slug === slug)?.label ?? slug).join(" → ")}</dd></div>
        </dl>
        <div className="creation-callout"><Sparkles size={18} aria-hidden="true" /><p>{unlimited ? "Agency: unlimited credits."
          : `Cost: one generation (10 shared credits if your allowance is used up)${extraPageCredits(values.desiredPages.length) ? ` + ${extraPageCredits(values.desiredPages.length)} shared credits for extra pages` : ""}. Failed-page retries are free.`}</p></div>
        {!existingSite ? <label className="flex flex-col gap-2 text-sm font-medium">Site address
          <span className="creation-url"><Globe2 size={16} className="ml-3 shrink-0" aria-hidden="true" />
          <input aria-label="Subdomain" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={63} className={fieldClass} value={values.subdomain}
            onChange={(event) => set("subdomain", event.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} />
          <span className="shrink-0 font-normal">.{rootDomain}</span></span>
          <span className="creation-hint font-normal">Availability is checked before generation and when saving. Connect a custom domain later.</span>
        </label> : needsConfirmation ? <label className="creation-callout creation-callout-warning">
          <input type="checkbox" required className="mt-1" checked={values.confirmReplace} onChange={(event) => set("confirmReplace", event.target.checked)} />
          <span>Only selected drafts will be replaced. Published content is unchanged. You can restore drafts from version history.</span>
        </label> : null}
        {changesBusiness ? <label className="creation-callout creation-callout-warning">
          <input type="checkbox" required className="mt-1" checked={values.confirmBusinessUpdate}
            onChange={(event) => set("confirmBusinessUpdate", event.target.checked)} />
          <span>Update shared Business information with these details. This changes contact details and the business name on published pages too. Saved social profiles are kept.</span>
        </label> : null}
        <p className="text-xs leading-relaxed text-zinc-600 sm:col-span-2">Selected pages will be saved as drafts, never published automatically. Completed AI work is metered even if saving fails. Missing facts use placeholders. Review all copy before publishing.</p>
      </> : null}
    </fieldset>
    {busy ? <div role="status" aria-live="polite" className="creation-progress">
      <p className="flex items-center gap-2 font-medium"><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Building your draft site. Keep this page open.</p>
      <ul className="mt-2 space-y-1 text-zinc-600">{messages.map((message, index) => <li key={index}>{message}</li>)}</ul>
    </div> : null}
    {error ? <div role="alert" className="creation-error">
      <p>{error}</p>
      {issues.length ? <ul className="mt-2 list-disc pl-5">
        {issues.map(({ path, code, message, received }, index) => <li key={index}>{path.join(".") || "(root)"} ({code}): {message}{received ? ` Received: ${received}.` : ""}</li>)}
      </ul> : null}
    </div> : null}
    <footer className="creation-footer">
      <span className="creation-hint">{step === 3 ? "Drafts only. You choose when to publish." : "Your choices are kept as you move between steps."}</span>
      <div className="creation-footer-actions">
      {step > 0 ? <button type="button" disabled={busy} className="creation-secondary" onClick={() => { setStep(step - 1); setError(""); setIssues([]); }}><ArrowLeft size={15} aria-hidden="true" />Back</button> : null}
      <button type="submit" disabled={busy} className="creation-primary">{busy ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : step === 3 ? <Sparkles size={16} aria-hidden="true" /> : null}
        {busy ? "Building…" : step === 3 ? "Build draft site" : "Continue"}{!busy && step < 3 ? <ArrowRight size={15} aria-hidden="true" /> : null}</button>
      </div>
    </footer>
    </SiteCreationShell>
  </form>;
}
