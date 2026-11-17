"use client";

import { useState } from "react";
import { businessSchema, type Business } from "@/lib/business";
import { saveBusinessInfo } from "@/lib/business-actions";

export function BusinessInfo({ siteId, initialBusiness, onSave }: {
  siteId: string; initialBusiness: Business; onSave?: (business: Business) => void;
}) {
  const [values, setValues] = useState(initialBusiness);
  const [services, setServices] = useState(initialBusiness.services.join("\n"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const set = (key: Exclude<keyof Business, "services">, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  const control = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
  return <form className="platform-panel p-5" onSubmit={async (event) => {
    event.preventDefault();
    const parsed = businessSchema.safeParse({ ...values, services: services.split("\n").map((s) => s.trim()).filter(Boolean) });
    if (!parsed.success) { setError(true); setMessage(parsed.error.issues[0]?.message ?? "Check your details."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await saveBusinessInfo(siteId, parsed.data);
      if (result.status === "error") { setError(true); setMessage(result.message); return; }
      setValues(result.business); setServices(result.business.services.join("\n"));
      setError(false); setMessage("Business information saved."); onSave?.(result.business);
    } catch (cause) {
      console.error("Unable to save business information", { type: cause instanceof Error ? cause.name : "Unknown" });
      setError(true); setMessage("Could not save business information. Please retry.");
    } finally { setBusy(false); }
  }}><fieldset disabled={busy} className="space-y-4">
    <h2 className="text-sm font-semibold">Business info</h2>
    <p className="text-xs text-zinc-500">Used by AI when editing this site. Enter verified information only.</p>
    {([
      ["businessName", "Business name", 100], ["businessType", "Business type", 100],
      ["city", "City / service area", 100], ["tone", "Tone of voice", 200],
      ["phone", "Phone", 40], ["email", "Email", 254], ["address", "Address", 250],
    ] as const).map(([key, label, maxLength]) => <label key={key} className="block text-xs font-medium">{label}
      <input className={control} maxLength={maxLength} type={key === "email" ? "email" : "text"}
        value={values[key]} onChange={(event) => set(key, event.target.value)} />
    </label>)}
    <label className="block text-xs font-medium">Services (one per line)
      <textarea className={control} rows={3} maxLength={1619} value={services} onChange={(event) => setServices(event.target.value)} />
    </label>
    {([["difference", "What makes you different"], ["openingHours", "Opening hours"]] as const).map(([key, label]) =>
      <label key={key} className="block text-xs font-medium">{label}
        <textarea className={control} maxLength={1000} rows={2} value={values[key]} onChange={(event) => set(key, event.target.value)} />
      </label>)}
    <button disabled={busy} className="rounded-lg bg-[#121212] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{busy ? "Saving..." : "Save business info"}</button>
    {message ? <p role={error ? "alert" : "status"} className={`text-xs ${error ? "text-red-700" : "text-zinc-600"}`}>{message}</p> : null}
    </fieldset>
  </form>;
}
