import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { customDomainSchema, type DomainSite } from "@/lib/domains";
import { checkAndSaveDomain, domainSiteColumns } from "@/lib/domains/check";
import { notifyDomainLive } from "@/lib/domains/email";
import { notifyDomainRequestDone } from "@/lib/domains/request-email";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const started = Date.now();
  const before = new Date(started).toISOString();
  let checked = 0;
  let failed = 0;
  let more = false;
  // Oldest-first timestamps make subsequent runs resume fairly if a large batch times out.
  while (Date.now() - started < 240_000) {
    const batch = await admin.from("sites").select(domainSiteColumns)
      .not("custom_domain", "is", null).eq("domain_verified", false).is("domain_check_stopped_at", null)
      .or(`domain_last_checked_at.is.null,domain_last_checked_at.lt.${before}`)
      .order("domain_last_checked_at", { ascending: true, nullsFirst: true }).order("id").limit(20);
    if (batch.error) {
      console.error("Could not load pending domains");
      return Response.json({ error: "Could not load pending domains" }, { status: 500 });
    }
    if (!batch.data?.length) { more = false; break; }
    more = true;
    for (let offset = 0; offset < batch.data.length; offset += 5) {
      await Promise.all(batch.data.slice(offset, offset + 5).map(async (site: DomainSite) => {
        try {
          if (!site.custom_domain || !customDomainSchema.safeParse(site.custom_domain).success) throw new Error("Invalid saved domain.");
          await checkAndSaveDomain(site, true);
          checked++;
        } catch (error) {
          failed++;
          console.error("Background domain check failed", { siteId: site.id, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }));
      if (Date.now() - started >= 240_000) break;
    }
    // Avoid a tight retry loop if the database could not record a check.
    if (failed) break;
  }
  if (process.env.RESEND_API_KEY) {
    let afterRequestId = "00000000-0000-0000-0000-000000000000";
    while (Date.now() - started < 255_000) {
      const requests = await admin.from("domain_requests").select("id").eq("status", "done")
        .is("notification_sent_at", null).gt("id", afterRequestId).order("id").limit(20);
      if (requests.error) { failed++; console.error("Could not load domain request notifications"); break; }
      if (!requests.data?.length) break;
      for (const request of requests.data) {
        try { await notifyDomainRequestDone(request.id); }
        catch (error) {
          failed++;
          console.error("Domain request notification failed", { requestId: request.id, error: error instanceof Error ? error.message : "Unknown error" });
        }
        afterRequestId = request.id;
        if (Date.now() - started >= 255_000) break;
      }
    }
    let afterId = "";
    while (Date.now() - started < 280_000) {
      const emails = await admin.from("sites").select("id").eq("domain_verified", true)
        .not("custom_domain", "is", null).is("domain_notification_sent_at", null)
        .gt("id", afterId || "00000000-0000-0000-0000-000000000000").order("id").limit(20);
      if (emails.error) { failed++; console.error("Could not load domain notifications"); break; }
      if (!emails.data?.length) break;
      for (const site of emails.data) {
        try { await notifyDomainLive(site.id); }
        catch (error) { failed++; console.error("Domain notification failed", { siteId: site.id, error: error instanceof Error ? error.message : "Unknown error" }); }
        afterId = site.id;
        if (Date.now() - started >= 280_000) break;
      }
    }
  }
  return Response.json({ checked, failed, more }, { status: failed ? 500 : 200 });
}
