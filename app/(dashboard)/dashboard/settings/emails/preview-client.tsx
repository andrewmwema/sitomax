"use client";

import { useState, useTransition } from "react";
import { Monitor, Smartphone } from "lucide-react";
import type { RenderedEmail } from "@/emails/render";

export function EmailPreviewClient({ templates, selected, rendered, sendAction }: {
  templates: Array<{ id: string; name: string }>;
  selected: string;
  rendered: RenderedEmail;
  sendAction: (templateId: string) => Promise<{ error?: string; success?: string }>;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav className="platform-panel p-2" aria-label="Email templates">
        {templates.map((template) => (
          <a key={template.id} href={`/dashboard/settings/emails?template=${encodeURIComponent(template.id)}`}
            className={`block rounded-lg px-3 py-2.5 text-sm ${template.id === selected ? "bg-[var(--platform-subtle)] font-semibold" : "text-[var(--platform-muted)]"}`}>
            {template.name}
          </a>
        ))}
      </nav>
      <div className="platform-panel min-w-0 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--platform-muted)]">Subject</p>
            <p className="mt-1 font-medium">{rendered.subject}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDevice("desktop")} className="platform-button" aria-pressed={device === "desktop"}><Monitor size={15} />Desktop</button>
            <button type="button" onClick={() => setDevice("mobile")} className="platform-button" aria-pressed={device === "mobile"}><Smartphone size={15} />Mobile</button>
          </div>
        </div>
        <div className="overflow-auto rounded-xl bg-[#F5F6FA] p-3 sm:p-6">
          <iframe title="Email preview" srcDoc={rendered.html} className="mx-auto block border-0 bg-white" style={{ width: device === "mobile" ? 360 : "100%", maxWidth: 600, height: 720 }} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p role="status" className="text-sm text-[var(--platform-muted)]">{status}</p>
          <button type="button" disabled={pending} className="platform-button platform-button-primary" onClick={() => startTransition(async () => {
            setStatus("");
            const result = await sendAction(selected);
            setStatus(result.error ?? result.success ?? "");
          })}>{pending ? "Sending..." : "Send test to me"}</button>
        </div>
      </div>
    </div>
  );
}
