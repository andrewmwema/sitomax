import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { graderConfigurationChecks } from "@/lib/grader/health";
import { graderDatabaseChecks } from "@/lib/grader/health-database";

export const dynamic = "force-dynamic";

export default async function GraderHealthPage() {
  const { supabase } = await requireSuperAdmin();
  const checks = [...graderConfigurationChecks(), ...await graderDatabaseChecks(supabase)];
  return <section className="flex flex-col gap-5">
    <header>
      <p className="platform-eyebrow mb-1">Management</p>
      <h1 className="text-2xl font-semibold">Website grader health</h1>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">Configuration and read-only database checks. Optional settings are identified below.</p>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">A check does not verify provider credentials, sender approval, stream type, cron execution, or delivery. Public variables require a redeploy.</p>
      <Link href="/dashboard/admin/grader" className="mt-3 inline-block text-sm underline">Back to grader</Link>
    </header>
    <ul className="platform-panel divide-y divide-[var(--platform-line)]">
      {checks.map((check) => <li key={check.name} className="flex gap-3 p-4">
        <span aria-label={check.ok ? "Pass" : "Needs attention"} className={check.ok ? "text-emerald-700" : "text-red-700"}>{check.ok ? "✓" : "✗"}</span>
        <div><h2 className="break-all font-semibold">{check.name}</h2><p className="text-sm text-[var(--platform-muted)]">{check.detail}</p></div>
      </li>)}
    </ul>
  </section>;
}
