import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { GraderHealthCheck } from "./health";
import { graderRpc } from "./worker";

export async function graderDatabaseChecks(supabase: Awaited<ReturnType<typeof createClient>>): Promise<GraderHealthCheck[]> {
  const account = z.uuid().safeParse(process.env.GRADER_LEADS_ACCOUNT_ID);
  const site = z.uuid().safeParse(process.env.GRADER_LEADS_SITE_ID);
  const destination = async (): Promise<GraderHealthCheck> => {
    if (!account.success || !site.success) return { name: "Lead destination", ok: false, detail: "Set both lead destination UUIDs first." };
    const { data, error } = await supabase.from("sites").select("id").eq("id", site.data).eq("account_id", account.data).maybeSingle();
    if (error) console.error("Grader health: lead destination query failed", { code: error.code });
    return { name: "Lead destination", ok: !error && Boolean(data), detail: error ? "Could not check the site and account."
      : data ? "The configured site belongs to the configured account." : "Site and account do not match or are inaccessible." };
  };
  const worker = async (): Promise<GraderHealthCheck> => {
    try {
      await graderRpc("grader_get_cache", { p_id: "00000000-0000-4000-8000-000000000000", p_final_url: "https://example.com/" });
      return { name: "Grader worker and database", ok: true, detail: "Worker secret and read-only database RPC succeeded." };
    } catch {
      console.error("Grader health: worker or database check failed");
      return { name: "Grader worker and database", ok: false, detail: "Worker configuration, secret registration, RPC or database access failed; check server logs." };
    }
  };
  const migrations = async (): Promise<GraderHealthCheck> => {
    const results = await Promise.all([
      supabase.from("grader_notifications").select("id").limit(1),
      supabase.from("grader_report_mail").select("unlock_id").limit(1),
      supabase.from("grader_followups").select("unlock_id").limit(1),
    ]);
    const errors = results.flatMap((result) => result.error ? [result.error.code] : []);
    if (errors.length) console.error("Grader health: Phase B database check failed", { codes: errors });
    return { name: "Phase B database tables", ok: errors.length === 0, detail: errors.length
      ? "Could not read one or more Phase B tables; check migrations, permissions and database health."
      : "Notification, report-mail and follow-up tables are readable." };
  };
  return Promise.all([destination(), worker(), migrations()]);
}
