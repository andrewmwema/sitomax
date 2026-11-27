"use client";

import { useId, useState, type FormEvent } from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { brand } from "@/lib/brand";
import { graderSlugSchema } from "@/lib/grader/public-report";
import { Turnstile } from "./turnstile";

const responseSchema = z.object({ slug: graderSlugSchema });

export function GraderScanForm({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
  return <ScanForm initialUrl={initialUrl} navigate={(slug) => router.push(`/grader/${encodeURIComponent(slug)}`)} />;
}

export function GraderEmbeddedForm({ preview = false }: { preview?: boolean }) {
  return <ScanForm compact preview={preview} navigate={(slug) => {
    const protocol = brand.rootDomain.includes("localhost") ? "http" : "https";
    const destination = new URL(`/grader/${encodeURIComponent(slug)}`, `${protocol}://${brand.rootDomain}`);
    window.location.assign(destination.href);
  }} />;
}

function ScanForm({ initialUrl = "", compact = false, preview = false, navigate }: {
  initialUrl?: string; compact?: boolean; preview?: boolean; navigate: (slug: string) => void;
}) {
  const fieldId = useId();
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) { setError("Please complete verification before starting your scan."); return; }
    const data = new FormData(event.currentTarget);
    const profile = String(data.get("profile") ?? "");
    const maps = String(data.get("maps") ?? "").trim();
    setBusy(true); setError(null);
    try {
      const response = await fetch(`${brand.appUrl}/api/grader/scan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: String(data.get("url") ?? ""), businessName: String(data.get("businessName") ?? ""),
          city: String(data.get("city") ?? ""), ...(profile ? { hasGoogleProfile: profile } : {}),
          ...(maps ? { googleMapsUrl: maps } : {}), turnstileToken: token,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = z.object({ error: z.string() }).safeParse(body);
        throw new Error(parsed.success ? parsed.data.error : "Couldn't start your scan. Please try again.");
      }
      const result = responseSchema.parse(body);
      navigate(result.slug);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't start your scan. Please try again.");
      setResetKey((value) => value + 1);
      setBusy(false);
    }
  }
  if (compact) return <form className="flex flex-col gap-3" onSubmit={submit}>
    <label className="sr-only" htmlFor={fieldId}>Your website URL</label>
    <div className="flex flex-col gap-3 sm:flex-row">
      <input id={fieldId} name="url" required maxLength={2048} placeholder="yourwebsite.com" autoComplete="url"
        disabled={preview} defaultValue={initialUrl} className="min-w-0 flex-1 rounded-lg border px-4 py-3"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg)", color: "var(--color-text)" }} />
      <button disabled={busy || preview} type="submit" className="rounded-lg px-6 py-3 font-semibold disabled:opacity-60"
        style={{ backgroundColor: "var(--btn-bg, var(--color-primary))", color: "var(--btn-fg, var(--color-on-primary))" }}>
        {busy ? "Starting…" : "Grade my website"}
      </button>
    </div>
    {!preview ? <Turnstile onToken={setToken} resetKey={resetKey} /> : null}
    {error ? <p role="alert">{error}</p> : null}
  </form>;
  return <form className="grader-form" onSubmit={submit}>
    <label className="grader-sr-only" htmlFor="grader-url">Your website URL</label>
    <div className="grader-url-field"><input id="grader-url" name="url" required maxLength={2048}
      placeholder="yourwebsite.com" autoComplete="url" defaultValue={initialUrl} />
      <button disabled={busy} type="submit">{busy ? "Starting…" : "Grade my website"} <span aria-hidden="true">→</span></button></div>
    <details className="grader-details"><summary>Improve accuracy <span>(optional)</span></summary>
      <div className="grader-fields">
        <label>Business name<input name="businessName" maxLength={160} autoComplete="organization" /></label>
        <label>City<input name="city" maxLength={160} autoComplete="address-level2" /></label>
        <label>Google Business Profile<select name="profile" defaultValue=""><option value="">Not provided</option>
          <option value="yes">Yes</option><option value="no">No</option><option value="not_sure">Not sure</option></select></label>
        <label>Google Maps link<input name="maps" type="url" maxLength={2048} placeholder="https://" /></label>
      </div>
    </details>
    <Turnstile onToken={setToken} resetKey={resetKey} />
    {error ? <p className="grader-error" role="alert">{error}</p> : null}
  </form>;
}
