"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createGenerationInputSchema, type GenerationInput } from "@/lib/ai/site-input";
import { DESIRED_SECTION_TYPES, GENERATION_PAGE_SLUGS } from "@/lib/ai/site-input";
import type { Business } from "@/lib/business";

const fieldClass = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-zinc-900";
const pageLabels: Record<(typeof GENERATION_PAGE_SLUGS)[number], string> = {
  "": "Home", about: "About", services: "Services", contact: "Contact",
};
const sectionLabels: Record<(typeof DESIRED_SECTION_TYPES)[number], string> = {
  gallery: "Gallery", testimonials: "Testimonials", faq: "FAQ", pricing: "Pricing",
  team: "Team", process: "Process", logos: "Partner logos",
};
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), message: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("result"), siteId: z.uuid(), pageId: z.uuid(), warnings: z.array(z.string()) }),
]);

export function AiSiteWizard({ accounts, existingSite, rootDomain, marketingSubdomain }: {
  accounts: { id: string; name: string; is_internal?: boolean }[];
  existingSite?: { id: string; accountId: string; name: string; business: Business };
  rootDomain: string;
  marketingSubdomain: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<GenerationInput>({
    accountId: existingSite?.accountId ?? "", siteId: existingSite?.id, subdomain: existingSite ? undefined : "",
    businessName: existingSite?.business.businessName || existingSite?.name || "",
    businessType: existingSite?.business.businessType ?? "", city: existingSite?.business.city ?? "",
    services: existingSite?.business.services ?? [], difference: existingSite?.business.difference ?? "",
    tone: existingSite?.business.tone ?? "", openingHours: existingSite?.business.openingHours ?? "",
    style: "auto", generationMode: "catalog", styleDirection: "auto", fontDirection: "auto",
    designDescription: "", desiredPages: [...GENERATION_PAGE_SLUGS], desiredSections: [],
    primaryColor: "", secondaryColor: "", phone: existingSite?.business.phone ?? "",
    email: existingSite?.business.email ?? "", address: existingSite?.business.address ?? "", description: "", confirmReplace: false,
  });
  const isInternal = accounts.some((account) => account.id === values.accountId && account.is_internal);
  const generationInputSchema = createGenerationInputSchema(marketingSubdomain, isInternal);
  const [service, setService] = useState("");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [result, setResult] = useState<{ pageId: string; warnings: string[] } | null>(null);
  const set = <K extends keyof GenerationInput>(key: K, value: GenerationInput[K]) => {
    setValues((previous) => ({ ...previous, [key]: value })); setError("");
  };
  const addService = () => {
    const tag = service.trim();
    if (tag && values.services.length < 20 && !values.services.includes(tag)) set("services", [...values.services, tag]);
    setService("");
  };
  const generate = async () => {
    const parsed = generationInputSchema.safeParse(values);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your details."); return; }
    setBusy(true); setError(""); setMessages(["Planning your site…"]);
    try {
      const response = await fetch("/api/ai/generate-site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (!response.ok || !response.body) throw new Error("Could not start generation. Check your connection and sign-in.");
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = "", complete = false;
      const receive = (line: string) => {
        const event = eventSchema.parse(JSON.parse(line));
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "progress") setMessages((previous) => previous.at(-1) === event.message ? previous : [...previous, event.message]);
        if (event.type === "result") {
          complete = true;
          setResult(event);
          router.push(`/editor/${event.pageId}`);
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
      console.error("Site generation did not complete", { type: cause instanceof Error ? cause.name : "Unknown" });
      setError(cause instanceof Error && !(cause instanceof z.ZodError) ? cause.message : "The progress response was invalid. Check your drafts before retrying.");
    } finally { setBusy(false); }
  };
  if (result) return <div className="platform-panel p-6">
    <h2 className="text-xl font-semibold">Your drafts are ready</h2>
    <p className="mt-2 text-sm text-zinc-600">Nothing has been published. Review every page, placeholder and photo before publishing.</p>
    {result.warnings.length ? <ul role="status" className="my-4 list-disc space-y-2 pl-5 text-sm text-amber-900">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
    <button className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white" onClick={() => router.push(`/editor/${result.pageId}`)}>Open editor</button>
  </div>;
  return <form className="platform-panel p-5 sm:p-8" onSubmit={(event) => {
    event.preventDefault();
    if (step === 0) {
      if (!values.services.length && !service.trim()) { setError("Add at least one service."); return; }
      if (service.trim()) addService();
      setError(""); setStep(1);
    } else void generate();
  }}>
    <ol className="mb-6 flex gap-4 text-xs font-medium text-zinc-500" aria-label="AI setup steps">
      {["Business details", "Style & review"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={step === index ? "text-zinc-900" : ""}>{index + 1}. {label}</li>)}
    </ol>
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      {step === 0 ? <>
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
            <button type="button" className="rounded-lg border px-3 text-sm" disabled={!service.trim()} onClick={addService}>Add</button></div>
          <ul className="mt-2 flex flex-wrap gap-2">{values.services.map((tag) => <li key={tag}>
            <button type="button" aria-label={`Remove ${tag}`} className="rounded-full bg-zinc-100 px-3 py-1 text-xs" onClick={() => set("services", values.services.filter((entry) => entry !== tag))}>{tag} &times;</button>
          </li>)}</ul>
        </div>
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
      </> : <>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">Design approach</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {([
              ["catalog", "SitoMax designs", "Build with the existing curated section designs."],
              ["custom", "Original custom layout", "Compose an editable site from responsive layout blocks and elements."],
            ] as const).map(([mode, label, description]) => (
              <label key={mode} className={`cursor-pointer rounded-xl border p-4 ${values.generationMode === mode ? "border-zinc-900 bg-zinc-50" : "border-zinc-300"}`}>
                <input type="radio" name="generationMode" className="mr-2" value={mode} checked={values.generationMode === mode}
                  onChange={() => set("generationMode", mode)} />
                <span className="font-medium">{label}</span>
                <span className="mt-1 block pl-6 text-xs font-normal text-zinc-600">{description}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">Pages</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {GENERATION_PAGE_SLUGS.map((slug) => <label key={slug} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={values.desiredPages.includes(slug)} disabled={!slug}
                onChange={(event) => set("desiredPages", event.target.checked
                  ? [...values.desiredPages, slug]
                  : values.desiredPages.filter((page) => page !== slug))} />
              {pageLabels[slug]}
            </label>)}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Home is required. Unselected pages on an existing site are left unchanged.</p>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">Include these sections (optional)</legend>
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
        <label className="text-sm font-medium sm:col-span-2">More design guidance (optional)
          <textarea maxLength={800} className={`${fieldClass} mt-2`} rows={3} value={values.designDescription}
            onChange={(event) => set("designDescription", event.target.value)}
            placeholder="Describe a mood, layout preference, or colors. Do not include private customer information." />
        </label>
        <label className="text-sm font-medium sm:col-span-2">Design foundation
          <select className={`${fieldClass} mt-2`} value={values.style} onChange={(event) => {
            const style = z.enum(["classic", "modern", "auto"]).parse(event.target.value); set("style", style);
          }}><option value="auto">Let AI choose</option><option value="classic">Classic</option><option value="modern">Modern</option></select>
        </label>
        {(["primaryColor", "secondaryColor"] as const).map((key) => <label key={key} className="text-sm font-medium">{key === "primaryColor" ? "Primary" : "Secondary"} color (optional)
          <input className={`${fieldClass} mt-2`} value={values[key]} onChange={(event) => set(key, event.target.value)} placeholder="#1e3a5f" pattern="#[0-9a-fA-F]{6}" maxLength={7} />
        </label>)}
        {!existingSite ? <label className="text-sm font-medium sm:col-span-2">Subdomain
          <input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={63} className={`${fieldClass} mt-2`} value={values.subdomain}
            onChange={(event) => set("subdomain", event.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} />
          <span className="mt-1 block text-xs font-normal text-zinc-500">.{rootDomain} &mdash; availability is checked before generation and when saving.</span>
        </label> : <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm sm:col-span-2">
          <input type="checkbox" required className="mt-1" checked={values.confirmReplace} onChange={(event) => set("confirmReplace", event.target.checked)} />
          <span>This will replace your current unpublished changes. You can restore them from version history.</span>
        </label>}
        <p className="text-xs leading-relaxed text-zinc-600 sm:col-span-2">Selected pages will be saved as drafts, never published automatically. One generation uses your monthly allowance, or 10 shared credits after that. Completed AI work is metered even if saving fails. Missing facts use placeholders; stock photos are credited. Business details are sent to the agency&apos;s AI provider. Review all copy before publishing. Forms are not yet connected.</p>
      </>}
    </fieldset>
    {busy ? <div role="status" aria-live="polite" className="mt-6 rounded-xl bg-zinc-50 p-4 text-sm">
      <p className="font-medium">Building your draft site. Keep this page open.</p>
      <ul className="mt-2 space-y-1 text-zinc-600">{messages.map((message, index) => <li key={index}>{message}</li>)}</ul>
    </div> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
    <div className="mt-6 flex gap-3">
      {step > 0 ? <button type="button" disabled={busy} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" onClick={() => setStep(0)}>Back</button> : null}
      <button disabled={busy} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? "Building…" : step === 0 ? "Continue" : "Build draft site"}</button>
    </div>
  </form>;
}
