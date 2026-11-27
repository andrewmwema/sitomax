"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { brand } from "@/lib/brand";
import { graderSlugSchema } from "@/lib/grader/public-report";
import { Turnstile } from "./turnstile";

const responseSchema = z.object({ slug: graderSlugSchema });

export function GraderScanForm({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
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
      router.push(`/grader/${encodeURIComponent(result.slug)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't start your scan. Please try again.");
      setResetKey((value) => value + 1);
      setBusy(false);
    }
  }
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
