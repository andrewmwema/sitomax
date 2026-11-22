import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { isEmailConfigured } from "@/lib/email";
import { sendLeadDigest } from "@/lib/leads/notifications";
import { postLeadWebhook } from "@/lib/leads/webhooks";
import { forwardLeadReplies, leadMailConfig } from "@/lib/leads/reply-mail";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cron = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${cron}`);
  if (!cron || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const secret = process.env.LEAD_WORKER_SECRET;
  if (!secret || secret.length < 32) {
    console.error("Lead worker is missing its scoped credential");
    return Response.json({ error: "Lead worker is not configured" }, { status: 503 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const emailConfigured = isEmailConfigured();
  if (!emailConfigured) console.error("Lead digests and reply forwards cannot be sent: email delivery is not configured.");
  const [webhooks, digests] = await Promise.all([
    supabase.rpc("lead_worker_claim_webhooks", { p_secret: secret }),
    emailConfigured ? supabase.rpc("lead_worker_claim_digests", { p_secret: secret }) : null,
  ]);
  const maintenance = await supabase.rpc("lead_worker_maintenance", { p_secret: secret });
  if (webhooks.error || digests?.error || maintenance.error) console.error("Could not claim lead jobs", {
    webhook: webhooks.error?.code, digest: digests?.error?.code, maintenance: maintenance.error?.code,
  });
  let failures = Number(Boolean(webhooks.error)) + Number(Boolean(digests?.error))
    + Number(Boolean(maintenance.error)) + Number(!emailConfigured);
  const deliveries = (webhooks.data ?? []) as {
    event_id: string; lease_id: string; url: string; secret: string; payload: unknown;
  }[];
  const emails = (digests?.data ?? []) as Parameters<typeof sendLeadDigest>[0][];
  for (let offset = 0; offset < Math.max(deliveries.length, emails.length); offset += 5) {
    await Promise.all([
      ...deliveries.slice(offset, offset + 5).map(async (delivery) => {
        let httpStatus: number | null = null;
        try {
          httpStatus = await postLeadWebhook(delivery.url, delivery.secret, delivery.event_id, delivery.payload);
        } catch {
          console.warn("Lead webhook connection failed", { eventId: delivery.event_id });
        }
        const { data, error } = await supabase.rpc("lead_worker_finish_webhook", {
          p_secret: secret, p_event_id: delivery.event_id, p_lease_id: delivery.lease_id, p_http_status: httpStatus,
        });
        if (error || data !== true) {
          console.error("Could not record lead webhook attempt", { eventId: delivery.event_id, code: error?.code });
          failures++;
        }
      }),
      ...emails.slice(offset, offset + 5).map(async (digest) => {
        try { await sendLeadDigest(digest); }
        catch {
          console.error("Could not send lead digest", { siteId: digest.site_id });
          failures++;
        }
      }),
    ]);
  }
  let forwards = 0;
  if (emailConfigured && leadMailConfig()) {
    try {
      const result = await forwardLeadReplies();
      forwards = result.processed;
      failures += result.failures;
    } catch { console.error("Could not process pending reply forwards"); failures++; }
  }
  return Response.json({
    webhooks: deliveries.length,
    digests: emails.length,
    forwards,
    maintenance: maintenance.data ?? null,
    failures,
  }, { status: failures ? 500 : 200 });
}
