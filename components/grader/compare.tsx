"use client";

import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { brand } from "@/lib/brand";
import { compareGraderScores } from "@/lib/grader/compare";
import { adminReportSchema } from "@/lib/grader/report-schema";
import type { Category, CheckStatus } from "@/lib/grader/types";
import { Turnstile } from "./turnstile";

type Scores = z.infer<typeof adminReportSchema.shape.scores>;
type BaseReport = {
  slug: string;
  domain: string;
  scores?: Scores;
  results?: { checks: { id: string; category: Category; status: CheckStatus; value: string | number | null; detail: string; fix: string }[] } | null;
  competitor_slug?: string | null;
};

const competitorSchema = z.object({
  slug: z.string(), domain: z.string(), status: adminReportSchema.shape.status, scores: adminReportSchema.shape.scores,
});
type Competitor = z.infer<typeof competitorSchema>;

const styles = {
  public: {
    section: "grader-card grader-report-section grader-compare", form: "grader-compare-form", input: "",
    button: "grader-button", secondary: "grader-secondary-button", error: "grader-error", muted: "grader-compare-muted",
    table: "grader-compare-table", gaps: "grader-compare-gaps",
  },
  admin: {
    section: "platform-panel flex flex-col gap-4 p-5", form: "flex flex-wrap items-end gap-3",
    input: "min-w-64 flex-1 rounded-lg border border-[var(--platform-line)] px-3 py-2",
    button: "platform-button platform-button-primary", secondary: "platform-button", error: "text-sm text-[var(--platform-error)]",
    muted: "text-sm text-[var(--platform-muted)]", table: "w-full text-left text-sm [&_td]:py-1.5 [&_th]:py-1.5",
    gaps: "flex list-decimal flex-col gap-2 pl-5 text-sm",
  },
} as const;

function formatDiff(diff: number | null) {
  return diff === null ? "—" : diff === 0 ? "Even" : diff > 0 ? `They lead by ${diff}` : `You lead by ${-diff}`;
}

/** Side-by-side comparison with a competitor scan. Public scans need Turnstile and count toward the usual limits. */
export function GraderCompare({ base, mode }: { base: BaseReport; mode: "public" | "admin" }) {
  const css = styles[mode];
  const [slug, setSlug] = useState<string | null>(base.competitor_slug ?? null);
  const [competitor, setCompetitor] = useState<Competitor | null>(null);
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const url = mode === "admin" ? `/api/grader/admin/report/${encodeURIComponent(slug)}`
      : `${brand.appUrl}/api/grader/report/${encodeURIComponent(slug)}`;
    async function poll() {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("load");
        const data = competitorSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setCompetitor(data);
        if (data.status === "queued" || data.status === "running") timer = setTimeout(poll, 2000);
      } catch {
        if (!controller.signal.aborted) setError("Couldn't load the comparison. Please refresh the page.");
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [slug, mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget).get("url") ?? "").trim();
    if (!url) { setError("Enter the competitor's website address."); return; }
    if (mode === "public" && !token) { setError("Please complete verification before comparing."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(mode === "admin" ? "/api/grader/admin/scan" : `${brand.appUrl}/api/grader/scan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "admin" ? { url, compareSlug: base.slug } : { url, compareSlug: base.slug, turnstileToken: token }),
      });
      const body: unknown = await response.json().catch(() => null);
      const started = z.object({ slug: z.string() }).safeParse(body);
      if (!response.ok || !started.success) {
        const message = z.object({ error: z.string() }).safeParse(body);
        throw new Error(message.success ? message.data.error : "Couldn't start the comparison. Please try again.");
      }
      setCompetitor(null);
      setSlug(started.data.slug);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't start the comparison. Please try again.");
      setResetKey((value) => value + 1);
    } finally { setBusy(false); }
  }

  function reset() { setSlug(null); setCompetitor(null); setError(null); setToken(""); setResetKey((value) => value + 1); }

  const heading = <><h2 className={mode === "admin" ? "text-lg font-semibold" : undefined}>Compare with a competitor</h2>
    <p className={css.muted}>See how {base.domain} stacks up against another website, category by category.</p></>;

  if (!slug) return <section className={css.section} id="report-compare" aria-label="Compare with a competitor">
    {heading}
    <form className={css.form} onSubmit={submit} noValidate>
      <label className={mode === "admin" ? "flex min-w-64 flex-1 flex-col gap-1 text-sm font-medium" : undefined}>Competitor website
        <input className={css.input} name="url" type="text" inputMode="url" placeholder="competitor.com" required maxLength={2048} />
      </label>
      {mode === "public" ? <Turnstile onToken={setToken} resetKey={resetKey} /> : null}
      <button className={css.button} type="submit" disabled={busy}>{busy ? "Starting…" : "Compare"}</button>
    </form>
    {error ? <p className={css.error} role="alert">{error}</p> : null}
  </section>;

  const comparison = competitor?.status === "complete" ? compareGraderScores(base, competitor) : null;
  return <section className={css.section} id="report-compare" aria-label="Compare with a competitor">
    {heading}
    {error ? <p className={css.error} role="alert">{error}</p> : null}
    {!error && (!competitor || competitor.status === "queued" || competitor.status === "running")
      ? <p className={css.muted} aria-live="polite">Scanning {competitor?.domain ?? "the competitor"}… this usually takes about a minute.</p> : null}
    {competitor?.status === "failed" ? <p className={css.error} role="alert">We couldn&apos;t scan {competitor.domain}. Check the address and try again.</p> : null}
    {comparison && competitor ? <>
      <div style={{ overflowX: "auto" }}><table className={css.table}>
        <thead><tr><th scope="col">Category</th><th scope="col">{base.domain}</th><th scope="col">{competitor.domain}</th><th scope="col">Difference</th></tr></thead>
        <tbody>
          <tr><th scope="row">Overall</th><td><strong>{comparison.overall.base ?? "—"}</strong></td>
            <td><strong>{comparison.overall.competitor ?? "—"}</strong></td><td>{formatDiff(comparison.overall.diff)}</td></tr>
          {comparison.rows.map((row) => <tr key={row.key}><th scope="row">{row.label}</th>
            <td>{row.base ?? "Couldn't check"}</td><td>{row.competitor ?? "Couldn't check"}</td><td>{formatDiff(row.diff)}</td></tr>)}
        </tbody>
      </table></div>
      <h3 className={mode === "admin" ? "font-semibold" : undefined}>Top gaps to close</h3>
      {comparison.gaps.length ? <ol className={css.gaps}>{comparison.gaps.map((gap) => <li key={gap.key}>
        <strong>{gap.label}:</strong> {competitor.domain} scores {gap.competitor} vs your {gap.base} ({gap.diff} points ahead).
        {gap.fix ? <> Start with: {gap.fix}.</> : null}
      </li>)}</ol> : <p className={css.muted}>{base.domain} is level with or ahead of {competitor.domain} in every scored category.</p>}
    </> : null}
    {competitor && competitor.status !== "queued" && competitor.status !== "running" || error
      ? <p><button className={css.secondary} type="button" onClick={reset}>Compare with a different website</button></p> : null}
  </section>;
}
