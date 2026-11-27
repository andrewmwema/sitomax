import { z } from "zod";
import { GraderAdmin } from "@/components/dashboard/grader-admin";
import { requireSuperAdmin } from "@/lib/auth";

export default async function GraderPage({ searchParams }: { searchParams: Promise<{ report?: string | string[] }> }) {
  await requireSuperAdmin();
  const { report } = await searchParams;
  const parsed = z.string().regex(/^[a-z0-9-]{1,60}$/).safeParse(report);
  return <section className="flex flex-col gap-5">
    <header>
      <p className="platform-eyebrow mb-1">Management</p>
      <h1 className="text-2xl font-semibold tracking-tight">Website grader</h1>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">Run a website scan for a prospect and review the full report.</p>
    </header>
    <GraderAdmin initialSlug={parsed.success ? parsed.data : null} />
  </section>;
}
