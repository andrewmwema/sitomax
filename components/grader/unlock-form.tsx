"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { brand } from "@/lib/brand";
import { Turnstile } from "./turnstile";

export function GraderUnlockForm({ slug, onUnlocked }: { slug: string; onUnlocked: () => void }) {
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) { setError("Please complete verification before unlocking your report."); return; }
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const response = await fetch(`${brand.appUrl}/api/grader/unlock`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""),
          phone: String(data.get("phone") ?? ""), consentMarketing: data.has("consentMarketing"), turnstileToken: token,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = z.object({ error: z.string() }).safeParse(body);
        throw new Error(parsed.success ? parsed.data.error : "Couldn't unlock your report. Please try again.");
      }
      z.object({ ok: z.literal(true) }).parse(body);
      onUnlocked();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't unlock your report. Please try again.");
      setResetKey((value) => value + 1);
      setBusy(false);
    }
  }
  return <form className="grader-unlock-form" onSubmit={submit}>
    <div className="grader-fields">
      <label>Name<input name="name" required maxLength={120} autoComplete="name" /></label>
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label>Phone (optional)<input name="phone" type="tel" maxLength={80} autoComplete="tel" /></label>
    </div>
    <label className="grader-consent"><input name="consentMarketing" type="checkbox" /> Send me tips and offers from {brand.name}</label>
    <Turnstile onToken={setToken} resetKey={resetKey} />
    {error ? <p className="grader-error" role="alert">{error}</p> : null}
    <button className="grader-button" disabled={busy} type="submit">{busy ? "Unlocking…" : "Unlock my full report"}</button>
  </form>;
}
