"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Check, LifeBuoy, Palette, Save, ShieldCheck } from "lucide-react";
import { ImageUploadField } from "@/components/editor/image-upload-field";
import { idleState, type ActionState } from "@/lib/form-state";
import type { AgencySettings } from "@/lib/agency";
import { brand } from "@/lib/brand";
import { nearestContrast } from "@/lib/theme/contrast";

const inputClasses = "w-full border px-3.5 py-2.5 text-sm font-normal";
const sections = [
  { id: "agency-profile", label: "Agency profile", icon: Building2 },
  { id: "agency-branding", label: "Branding", icon: Palette },
  { id: "account-access", label: "Account & access", icon: ShieldCheck },
];

export function AgencySettingsForm({ settings, action, account }: {
  settings: AgencySettings;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  account: { name: string; email: string };
}) {
  const initial = {
    name: settings.name, supportEmail: settings.supportEmail ?? "", logoUrl: settings.logoUrl ?? "", primaryColor: settings.primaryColor,
  };
  const [fields, setFields] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const dirty = fields.name !== saved.name || fields.supportEmail !== saved.supportEmail ||
    fields.logoUrl !== saved.logoUrl || fields.primaryColor !== saved.primaryColor;
  const [state, formAction, pending] = useActionState(async (previous: ActionState, formData: FormData) => {
    const submitted = {
      name: String(formData.get("name") ?? "").trim(),
      supportEmail: String(formData.get("support_email") ?? "") || brand.supportEmail,
      logoUrl: String(formData.get("logo_url") ?? ""),
      primaryColor: String(formData.get("primary_color") ?? ""),
    };
    const result = await action(previous, formData);
    if (result.status === "success") {
      setSaved(submitted);
      setFields(submitted);
    }
    return result;
  }, idleState);
  const accent = useMemo(() => nearestContrast(fields.primaryColor, ["#ffffff", "#e5e3e1"]) ?? "#4b3fe0", [fields.primaryColor]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (!["http:", "https:"].includes(destination.protocol)) return;
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm("You have unsaved settings. Leave without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);

  return <div className="grid items-start gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
    <nav aria-label="Settings sections" className="flex flex-wrap gap-1 lg:sticky lg:top-5 lg:flex-col">
      {sections.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-[var(--platform-secondary)] hover:bg-[var(--platform-subtle)]"><Icon size={15} />{label}</a>)}
    </nav>
    <form action={formAction} className="flex min-w-0 flex-col gap-5">
      <fieldset disabled={pending} className="contents">
        <section id="agency-profile" className="platform-panel scroll-mt-5 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="rounded-lg border border-[var(--platform-line)] p-2 text-[var(--platform-muted)]"><Building2 size={17} /></span><div><h2 className="text-[15px] font-semibold">Agency profile</h2><p className="mt-1 text-xs text-[var(--platform-muted)]">Your agency identity and the contact clients can rely on.</p></div></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium">Agency name
              <input name="name" required maxLength={100} value={fields.name} onChange={(event) => setFields({ ...fields, name: event.target.value })} className={inputClasses} />
              <span className="text-xs font-normal text-[var(--platform-muted)]">Shown on the login screen and in the dashboard.</span>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">Support email
              <input type="email" name="support_email" value={fields.supportEmail} onChange={(event) => setFields({ ...fields, supportEmail: event.target.value })} placeholder={brand.supportEmail} className={inputClasses} />
              <span className="text-xs font-normal text-[var(--platform-muted)]">Leave blank to use the default support address.</span>
            </label>
          </div>
        </section>

        <section id="agency-branding" className="platform-panel scroll-mt-5 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="rounded-lg border border-[var(--platform-line)] p-2 text-[var(--platform-muted)]"><Palette size={17} /></span><div><h2 className="text-[15px] font-semibold">Branding</h2><p className="mt-1 text-xs text-[var(--platform-muted)]">Make the client workspace feel like your own.</p></div></div>
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <div className="flex flex-col gap-5">
              <div><h3 className="mb-2 text-sm font-medium">Agency logo</h3>
                <ImageUploadField agency value={fields.logoUrl} onChange={(logoUrl) => setFields({ ...fields, logoUrl })} readOnly={pending} initialQuery={fields.name} />
                <input type="hidden" name="logo_url" value={fields.logoUrl} />
                <p className="mt-2 text-xs text-[var(--platform-muted)]">PNG, JPEG, SVG or WebP, up to 2 MB. Choose, replace or remove using the media picker.</p>
              </div>
              <label className="flex flex-col gap-2 text-sm font-medium">Primary brand color
                <span className="flex items-center gap-3"><input type="color" name="primary_color" value={fields.primaryColor} onChange={(event) => setFields({ ...fields, primaryColor: event.target.value })} className="h-11 w-14 rounded-lg border border-[var(--platform-line)] bg-white p-1" /><span className="font-mono text-xs font-normal text-[var(--platform-secondary)]">{fields.primaryColor.toUpperCase()}</span></span>
                <span className="text-xs leading-relaxed font-normal text-[var(--platform-muted)]">Dashboard accent shades adjust for readability. Your websites keep their own themes.</span>
              </label>
            </div>
            <div aria-label="Branding preview" className="overflow-hidden rounded-xl border border-[var(--platform-line)] bg-[var(--platform-ground)]">
              <div className="border-b border-[var(--platform-line)] px-4 py-3"><p className="platform-eyebrow">Live branding preview</p><p className="mt-1 text-xs text-[var(--platform-muted)]">Preview only · {dirty ? "unsaved appearance" : "saved appearance"}</p></div>
              <div className="m-4 rounded-lg border border-[var(--platform-line)] bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- agency logos use configured storage URLs */}
                  {fields.logoUrl ? <img src={fields.logoUrl} alt="Agency logo preview" className="size-9 shrink-0 rounded-lg object-contain" /> : <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--platform-ink)] text-sm font-semibold text-white">{fields.name.charAt(0).toUpperCase() || "A"}</span>}
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{fields.name || "Your agency"}</span><span className="block text-xs text-[var(--platform-muted)]">Client workspace</span></span>
                </div>
                <div className="mt-5 flex items-center gap-2 rounded-lg border border-[var(--platform-line)] px-3 py-2.5 text-xs font-medium" style={{ color: accent }}><span className="h-4 w-0.5 rounded-full" style={{ backgroundColor: accent }} />Overview</div>
                <div className="mt-3 rounded-lg bg-[var(--platform-ground)] p-3"><p className="text-xs font-medium">Your websites, in one place</p><span className="mt-2 inline-flex items-center gap-1.5 text-xs" style={{ color: accent }}><Check size={13} />Agency-branded experience</span></div>
                <p className="mt-4 flex items-center gap-1.5 break-all text-[11px] text-[var(--platform-muted)]"><LifeBuoy size={13} className="shrink-0" />{fields.supportEmail || brand.supportEmail}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="account-access" className="platform-panel scroll-mt-5 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="rounded-lg border border-[var(--platform-line)] p-2 text-[var(--platform-muted)]"><ShieldCheck size={17} /></span><div><h2 className="text-[15px] font-semibold">Account &amp; access</h2><p className="mt-1 text-xs text-[var(--platform-muted)]">Your current workspace access. These details are read-only.</p></div></div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[var(--platform-muted)]">Signed in as</dt><dd className="mt-1 break-words font-medium">{account.name || account.email}</dd>{account.name ? <dd className="mt-1 break-all text-xs text-[var(--platform-muted)]">{account.email}</dd> : null}</div>
            <div><dt className="text-xs text-[var(--platform-muted)]">Workspace role</dt><dd className="mt-1"><span className="platform-status">Super admin</span></dd></div></dl>
          <p className="mt-4 text-xs leading-relaxed text-[var(--platform-muted)]">Client owners and editors are managed within their client accounts. Analytics and allowance reporting use UTC; the dashboard greeting uses each viewer&apos;s local time.</p>
          <Link href="/dashboard/clients" className="platform-button mt-4">Manage client access</Link>
        </section>
      </fieldset>

      <footer className="platform-panel sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 p-4">
        <div aria-live="polite">
          {state.status === "error" && dirty && !pending ? <p role="alert" className="text-sm text-[var(--platform-error)]">{state.message}</p> :
            <p className="text-xs text-[var(--platform-muted)]">{pending ? "Saving workspace settings..." : dirty ? "You have unsaved changes" : state.status === "success" ? state.message : "All changes saved"}</p>}
        </div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!dirty || pending} onClick={() => setFields(saved)} className="platform-button">Discard changes</button>
          <button type="submit" disabled={!dirty || pending} className="platform-button platform-button-primary"><Save size={14} />{pending ? "Saving..." : "Save settings"}</button></div>
      </footer>
    </form>
  </div>;
}
