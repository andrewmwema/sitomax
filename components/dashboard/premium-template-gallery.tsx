"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Eye, LayoutTemplate, LoaderCircle, Monitor, Smartphone, X } from "lucide-react";
import { createSiteFromMasterTemplate } from "@/app/(dashboard)/dashboard/sites/new/template-actions";
import type { PremiumTemplate, TemplateAccount } from "@/lib/templates/catalog";
import { TemplateAiWizard } from "./template-ai-wizard";

type Props = {
  templates: PremiumTemplate[];
  accounts: TemplateAccount[];
  isSuperAdmin: boolean;
  rootDomain: string;
};

function toSubdomain(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63);
}

export function PremiumTemplateGallery({ templates, accounts, isSuperAdmin, rootDomain }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [activePageSlug, setActivePageSlug] = useState("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [dialogMode, setDialogMode] = useState<"preview" | "create">("preview");
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : "");
  const [siteName, setSiteName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [aiTemplate, setAiTemplate] = useState<string | null>(null);
  const activeTemplate = templates.find((template) => template.id === activeTemplateId);
  const activePage = activeTemplate?.pages.find((page) => page.slug === activePageSlug) ?? activeTemplate?.pages[0];
  const viewportWidth = previewMode === "mobile" ? 390 : 1280;

  useEffect(() => {
    if (activeTemplateId && !dialog.current?.open) dialog.current?.showModal();
  }, [activeTemplateId]);

  const closeDialog = () => {
    setActiveTemplateId("");
    setActivePageSlug("");
    setDialogMode("preview");
    setError("");
  };

  const beginPreview = (template: PremiumTemplate) => {
    setActiveTemplateId(template.id);
    setActivePageSlug(template.pages[0]?.slug ?? "");
    setPreviewMode("desktop");
    setDialogMode("preview");
    setError("");
  };

  const beginCreate = () => {
    if (!activeTemplate) return;
    const defaultName = activeTemplate.business.businessName || activeTemplate.name;
    setSiteName(defaultName);
    setSubdomain(toSubdomain(defaultName));
    setDialogMode("create");
    setError("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeTemplate) return;
    startTransition(async () => {
      const result = await createSiteFromMasterTemplate({
        accountId,
        templateId: activeTemplate.id,
        siteName,
        subdomain,
        timezone,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.push(`/editor/${result.editorPageId}`);
    });
  };

  return <>
    <section aria-labelledby="premium-template-heading" className="flex flex-col gap-6">
      <header className="creation-page-header">
        <p className="platform-eyebrow">Curated website designs</p>
        <h1 id="premium-template-heading">Use SitoMax Designs</h1>
        <p>Explore complete, multi-page websites. Preview every page on desktop or mobile, then create an unpublished draft to personalize in the editor.</p>
      </header>

      {!accounts.length ? <p role="status" className="platform-panel p-5 text-sm">
        {isSuperAdmin
          ? "Create a client account before copying a design."
          : "Only client account owners can create a site. Ask your account owner for access."}
      </p> : null}
      {accounts.length && templates.length >= 2 ? <div>
        <button type="button" className="platform-button" onClick={() => setAiTemplate("")}>Help me choose a design with AI</button>
      </div> : null}

      {templates.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => <article key={template.id} className="platform-panel flex min-w-0 flex-col overflow-hidden">
          <div className="relative aspect-[16/10] bg-[#F1F0EC]">
            <Image src={template.preview_image} alt={`${template.name} website design preview`} fill unoptimized
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" className="object-cover" />
          </div>
          <div className="flex flex-1 flex-col gap-3 p-5">
            <div>
              <p className="platform-eyebrow">{template.pages.length} pages</p>
              <h2 className="mt-1 text-lg font-semibold">{template.name}</h2>
            </div>
            <p className="text-sm leading-6 text-[#6B6A66]">{template.description}</p>
            <ul className="flex flex-wrap gap-2" aria-label="Best suited for">
              {template.best_for.map((tag) => <li key={tag} className="rounded-full bg-[#F1F0EC] px-2.5 py-1 text-xs text-[#5F5E5A]">{tag}</li>)}
            </ul>
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <button type="button" className="platform-button" onClick={() => beginPreview(template)}>
                <Eye size={14} aria-hidden="true" />Preview all pages
              </button>
              <button type="button" className="platform-button platform-button-primary" onClick={() => beginPreview(template)}>
                <LayoutTemplate size={14} aria-hidden="true" />Use this design
              </button>
              <button type="button" className="platform-button" disabled={!accounts.length} onClick={() => setAiTemplate(template.id)}>
                Personalize with AI
              </button>
            </div>
          </div>
        </article>)}
      </div> : <div className="platform-panel border-dashed p-8 text-center">
        <h2 className="font-semibold">Designs are being prepared</h2>
        <p className="mt-2 text-sm text-[#6B6A66]">Please check back soon or contact your SitoMax administrator.</p>
      </div>}
    </section>

    <dialog ref={dialog} onClose={closeDialog} aria-labelledby="template-dialog-title"
      className="m-auto max-h-[92dvh] w-[min(96vw,1280px)] overflow-hidden rounded-2xl border border-[#E8E7E3] bg-white p-0 text-[#242321] shadow-2xl backdrop:bg-black/50">
      {activeTemplate ? <div className="flex max-h-[92dvh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-[#E8E7E3] px-5 py-4 sm:px-7">
          <div>
            <p className="platform-eyebrow">{dialogMode === "preview" ? "Design preview" : "Create your draft"}</p>
            <h2 id="template-dialog-title" className="mt-1 text-xl font-semibold">{activeTemplate.name}</h2>
          </div>
          <button type="button" className="platform-button shrink-0" aria-label="Close design preview" onClick={() => dialog.current?.close()}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {dialogMode === "preview" ? <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E7E3] px-5 py-3 sm:px-7">
            <label className="flex items-center gap-2 text-sm">
              Preview page
              <select aria-label="Preview page" value={activePage?.slug ?? ""} onChange={(event) => setActivePageSlug(event.target.value)} className="px-3 py-2">
                {activeTemplate.pages.map((page) => <option key={page.slug || "home"} value={page.slug}>{page.title}</option>)}
              </select>
            </label>
            <div role="group" aria-label="Preview device" className="flex rounded-lg border border-[#E8E7E3] p-1">
              <button type="button" aria-label="Desktop preview" aria-pressed={previewMode === "desktop"}
                onClick={() => setPreviewMode("desktop")} className={`rounded-md p-2 ${previewMode === "desktop" ? "bg-[#F1F0EC]" : ""}`}>
                <Monitor size={16} aria-hidden="true" />
              </button>
              <button type="button" aria-label="Mobile preview" aria-pressed={previewMode === "mobile"}
                onClick={() => setPreviewMode("mobile")} className={`rounded-md p-2 ${previewMode === "mobile" ? "bg-[#F1F0EC]" : ""}`}>
                <Smartphone size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#F1F0EC] p-3 sm:p-6">
            {activePage ? <div className="mx-auto overflow-hidden rounded-lg border border-[#D8D7D2] bg-white shadow-sm"
              style={{ width: `${viewportWidth}px`, maxWidth: "100%" }}>
              <iframe
                key={`${activeTemplate.id}:${activePage.slug}:${previewMode}`}
                title={`${activeTemplate.name} ${activePage.title} page ${previewMode} preview`}
                src={`/template-preview/${encodeURIComponent(activeTemplate.id)}/${encodeURIComponent(activePage.slug || "home")}`}
                sandbox="allow-same-origin"
                style={{ display: "block", width: `${viewportWidth}px`, height: "720px", maxWidth: "100%", border: 0 }}
              />
            </div> : null}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8E7E3] px-5 py-4 sm:px-7">
            <p className="text-sm text-[#6B6A66]">{activeTemplate.pages.length} editable pages · Your copy stays unpublished until you publish.</p>
            <button type="button" className="platform-button platform-button-primary" disabled={!accounts.length} onClick={beginCreate}>
              Use this design <ArrowRight size={15} aria-hidden="true" />
            </button>
          </footer>
        </> : <form onSubmit={submit} className="min-h-0 overflow-auto">
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <div className="flex flex-col gap-4">
              <p className="text-sm leading-6 text-[#5F5E5A]">
                Create a private draft from {activeTemplate.name}. It will not be visible to visitors until you publish it.
              </p>
              {accounts.length > 1 || isSuperAdmin ? <label className="flex flex-col gap-2 text-sm font-medium">
                Client account
                <select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className="creation-input">
                  <option value="">Choose an account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label> : accounts[0] ? <p className="rounded-lg bg-[#F6F5F2] p-3 text-sm">
                Creating for <strong>{accounts[0].name}</strong>
              </p> : null}
              <label className="flex flex-col gap-2 text-sm font-medium">
                Site name
                <input required maxLength={100} value={siteName} onChange={(event) => setSiteName(event.target.value)} className="creation-input" />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Site address
                <span className="creation-url">
                  <input aria-label="Site subdomain" required maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={subdomain} onChange={(event) => setSubdomain(event.target.value.toLowerCase())}
                    className="creation-input min-w-0 flex-1" autoCapitalize="none" spellCheck={false} />
                  <span className="shrink-0 pr-3 font-normal">.{rootDomain}</span>
                </span>
                <span className="text-xs font-normal text-[#6B6A66]">You can connect a custom domain later.</span>
              </label>
            </div>
            <aside className="rounded-xl bg-[#F6F5F2] p-5">
              <h3 className="font-semibold">What happens next</h3>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[#5F5E5A]">
                <li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-emerald-700" aria-hidden="true" />A complete {activeTemplate.pages.length}-page site is copied to your account.</li>
                <li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-emerald-700" aria-hidden="true" />The new site starts as an unpublished draft.</li>
                <li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-emerald-700" aria-hidden="true" />You can rename and customize it in the editor before publishing.</li>
              </ul>
            </aside>
          </div>
          {error ? <p role="alert" className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:mx-7">{error}</p> : null}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8E7E3] px-5 py-4 sm:px-7">
            <button type="button" disabled={pending} className="platform-button" onClick={() => { setDialogMode("preview"); setError(""); }}>
              <ArrowLeft size={15} aria-hidden="true" />Back to preview
            </button>
            <button type="submit" disabled={pending || !accountId || !siteName.trim() || !subdomain.trim()}
              className="platform-button platform-button-primary">
              {pending ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {pending ? "Creating draft..." : "Create draft and open editor"}
              {!pending ? <ArrowRight size={15} aria-hidden="true" /> : null}
            </button>
          </footer>
        </form>}
      </div> : null}
    </dialog>
    {aiTemplate !== null ? <TemplateAiWizard templates={templates} accounts={accounts} rootDomain={rootDomain}
      initialTemplateId={aiTemplate || undefined} isSuperAdmin={isSuperAdmin} onClose={() => setAiTemplate(null)} /> : null}
  </>;
}
