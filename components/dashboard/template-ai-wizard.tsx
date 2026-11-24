"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { z } from "zod";
import { businessIntakeSchema } from "@/lib/business";
import { extraPageCredits, generationOutcomeSchema } from "@/lib/ai/site-input";
import type { PremiumTemplate, TemplateAccount } from "@/lib/templates/catalog";

const choiceSchema = z.object({
  generationId: z.uuid(),
  recommended: z.object({ templateId: z.string(), reason: z.string() }),
  runnerUp: z.object({ templateId: z.string(), reason: z.string() }),
});
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), message: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("result"), siteId: z.uuid(), pageId: z.uuid(), warnings: z.array(z.string()), pages: z.array(generationOutcomeSchema) }),
  z.object({ type: z.literal("retry"), page: generationOutcomeSchema }),
]);
type Result = Extract<z.infer<typeof eventSchema>, { type: "result" }>;

export function TemplateAiWizard({ templates, accounts, rootDomain, initialTemplateId, isSuperAdmin, onClose }: {
  templates: PremiumTemplate[]; accounts: TemplateAccount[]; rootDomain: string;
  initialTemplateId?: string; isSuperAdmin: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : "");
  const [business, setBusiness] = useState<z.output<typeof businessIntakeSchema>>({
    businessName: "", businessType: "", city: "", services: [], difference: "", tone: "", phone: "",
    email: "", address: "", openingHours: "", primaryAction: "inquire", audiences: [], description: "",
  });
  const [services, setServices] = useState("");
  const [audiences, setAudiences] = useState("");
  const [siteName, setSiteName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [templateId, setTemplateId] = useState(initialTemplateId ?? "");
  const [choices, setChoices] = useState<z.infer<typeof choiceSchema> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [attempted, setAttempted] = useState(false);
  const template = templates.find((item) => item.id === templateId);
  const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
  const intake = { ...business, services: split(services), audiences: split(audiences) };

  useEffect(() => { dialog.current?.showModal(); }, []);
  const close = async () => {
    if (busy) return;
    if (choices && !attempted && !result) {
      setBusy(true);
      try {
        const response = await fetch("/api/ai/template-build", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "cancel", accountId, generationId: choices.generationId }),
        });
        const body = await response.json() as { message?: string };
        if (!response.ok) throw new Error(body.message ?? "Could not release the build reservation.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not release the build reservation.");
        setBusy(false); return;
      }
    }
    dialog.current?.close(); onClose();
  };
  const recommend = async () => {
    setBusy(true); setError(""); setMessage("Choosing designs…");
    try {
      const response = await fetch("/api/ai/template-build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "recommend", input: { accountId, business: intake } }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const failure = z.object({ message: z.string() }).safeParse(body);
        throw new Error(failure.success ? failure.data.message : "Could not recommend designs.");
      }
      const selected = choiceSchema.parse(body);
      setChoices(selected); setTemplateId(selected.recommended.templateId);
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof z.ZodError) ? cause.message : "Check the business details and try again.");
    } finally { setBusy(false); setMessage(""); }
  };
  const stream = async (retryId?: string) => {
    setBusy(true); setError(""); setMessage(retryId ? "Retrying page…" : "Preparing your draft…");
    if (!retryId) setAttempted(true);
    let requestId: string | null = null;
    try {
      const response = await fetch(retryId ? "/api/ai/generate-site" : "/api/ai/template-build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryId ? { retryId } : { mode: "build", input: {
          accountId, business: intake, templateId, siteName, subdomain,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          ...(choices ? { generationId: choices.generationId } : {}),
        } }),
      });
      requestId = response.headers.get("X-Request-ID");
      if (!response.ok || !response.body) throw new Error("Could not start. Check your drafts before retrying.");
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = "", complete = false;
      const receive = (line: string) => {
        const event = eventSchema.parse(JSON.parse(line));
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "progress") setMessage(event.message);
        if (event.type === "result") { complete = true; setResult(event); }
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
      const text = cause instanceof Error && !(cause instanceof z.ZodError) ? cause.message : "Invalid progress response. Check your drafts before retrying.";
      setError(requestId ? `${text} Reference: ${requestId}` : text);
    } finally { setBusy(false); setMessage(""); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!initialTemplateId && !choices) void recommend(); else void stream();
  };
  const field = (key: "businessName" | "businessType" | "city" | "phone" | "email" | "address" | "openingHours" | "difference" | "tone" | "description",
    label: string, required = false, maxLength = 100) => <label className="flex flex-col gap-1 text-sm font-medium">
      {label}<input className="creation-input" required={required} maxLength={maxLength} value={business[key]} disabled={Boolean(choices)}
        onChange={(event) => setBusiness((previous) => ({ ...previous, [key]: event.target.value }))} />
    </label>;

  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); void close(); }} aria-labelledby="template-ai-title"
    className="m-auto max-h-[92dvh] w-[min(94vw,800px)] overflow-auto rounded-2xl bg-white p-6 shadow-2xl backdrop:bg-black/50">
    <header className="flex items-center justify-between gap-4">
      <h2 id="template-ai-title" className="text-xl font-semibold">{result ? "Your draft is ready to review" : "Personalize a design with AI"}</h2>
      <button className="platform-button" type="button" disabled={busy} onClick={() => void close()}>Close</button>
    </header>
    {result ? <div className="mt-5 space-y-4">
      <p className="text-sm">Nothing is published. Review every page, placeholder and photo before publishing.</p>
      {result.warnings.map((warning) => <p role="status" key={warning} className="text-sm text-amber-800">{warning}</p>)}
      <ul className="space-y-2">{result.pages.map((page) => <li key={page.pageId} className="flex items-center justify-between gap-3 text-sm">
        <span>{page.label}: {page.built ? "Draft built" : "Needs attention"}</span>
        {page.built && page.pageId ? <a className="platform-button" href={`/editor/${page.pageId}`}>Open editor</a>
          : page.retryId ? <button className="platform-button" type="button" disabled={busy} onClick={() => void stream(page.retryId)}>Retry (free)</button> : null}
      </li>)}</ul>
      <a className="platform-button" href={`/dashboard/sites/${result.siteId}`}>Site overview</a>
    </div> : <form onSubmit={submit} className="mt-5 space-y-4">
      <p className="text-sm">We copy the design to a new unpublished site. Review the content before publishing. AI use counts as one site build.</p>
      <fieldset disabled={busy || attempted} className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">Client account
          <select required disabled={Boolean(choices)} className="creation-input" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        {field("businessName", "Business name", true)}
        {field("businessType", "Business type", true)}
        {field("city", "City / service area", true)}
        <label className="flex flex-col gap-1 text-sm font-medium">Services (comma-separated)
          <input className="creation-input" disabled={Boolean(choices)} value={services} onChange={(event) => setServices(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Audiences (comma-separated)
          <input className="creation-input" disabled={Boolean(choices)} value={audiences} onChange={(event) => setAudiences(event.target.value)} />
        </label>
        {field("difference", "What makes you different?", false, 1000)}
        {field("description", "Business description", false, 4000)}
        {field("tone", "Tone", false, 200)}
        {field("phone", "Phone", false, 40)}
        {field("email", "Email", false, 254)}
        {field("address", "Address", false, 250)}
        {field("openingHours", "Opening hours", false, 1000)}
        <label className="flex flex-col gap-1 text-sm font-medium">Primary action
          <select className="creation-input" disabled={Boolean(choices)} value={business.primaryAction}
            onChange={(event) => setBusiness((previous) => ({ ...previous, primaryAction: z.enum(["call", "book", "buy", "inquire"]).parse(event.target.value) }))}>
            <option value="inquire">Inquire</option><option value="call">Call</option><option value="book">Book</option><option value="buy">Buy</option>
          </select>
        </label>
        {choices ? <div className="space-y-2 sm:col-span-2">
          {[choices.recommended, choices.runnerUp].map((choice, index) => {
            const item = templates.find((candidate) => candidate.id === choice.templateId);
            return item ? <label key={item.id} className="block rounded-lg border p-3 text-sm">
              <input type="radio" name="template" checked={templateId === item.id} onChange={() => setTemplateId(item.id)} />
              {" "}{index === 0 ? "Recommended" : "Runner-up"}: <strong>{item.name}</strong> — {choice.reason}
            </label> : null;
          })}
        </div> : null}
        {(initialTemplateId || choices) ? <>
          <label className="flex flex-col gap-1 text-sm font-medium">Site name
            <input required maxLength={100} className="creation-input" value={siteName} onChange={(event) => setSiteName(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Site address (.{rootDomain})
            <input required maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="creation-input" value={subdomain}
              onChange={(event) => setSubdomain(event.target.value.toLowerCase())} />
          </label>
          {!isSuperAdmin && template && extraPageCredits(template.pages.length) ? <p className="text-sm sm:col-span-2">
            This {template.pages.length}-page design requires {extraPageCredits(template.pages.length)} extra credits.
          </p> : null}
        </> : null}
      </fieldset>
      {!attempted ? <button type="submit" className="platform-button platform-button-primary" disabled={busy || !accountId}>
        {!initialTemplateId && !choices ? "Recommend designs" : "Create personalized draft"}
      </button> : <Link className="platform-button" href="/dashboard/sites">Check your sites</Link>}
    </form>}
    {message ? <p className="mt-4 text-sm" role="status">{message}</p> : null}
    {error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
  </dialog>;
}
