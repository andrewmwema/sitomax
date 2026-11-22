"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isPublicHttpsUrl } from "@/lib/public-https";
import { EmailDeliveryError, sendEmail } from "@/lib/email";
import { renderLeadTestEmail } from "@/emails/registry";

const recipientsSchema = z.array(z.email().max(254)).max(25);
type Result = { error: string; success?: string };

function saved(siteId: string): Result {
  revalidatePath(`/dashboard/sites/${siteId}/leads`);
  return { error: "", success: "Settings saved." };
}

export async function saveLeadSettings(_previous: Result, form: FormData): Promise<Result> {
  const parsed = z.object({
    id: z.uuid(), intent: z.enum(["recipients", "notifications", "test_notification", "webhook", "preferences", "reply_mode", "limit"]),
  }).safeParse({ id: form.get("site"), intent: form.get("intent") });
  if (!parsed.success) return { error: "Invalid site settings request." };
  const { id, intent } = parsed.data;
  const { supabase, user } = await requireUser();
  const access = await supabase.rpc("can_manage_site_leads", { p_site: id });
  if (access.error || !access.data) {
    if (access.error) console.error("Could not check lead settings access", { code: access.error.code });
    return { error: "Only site owners and the agency can manage these settings." };
  }
  const table = supabase.from("lead_site_settings");
  if (intent === "test_notification") {
    const [site, recipients] = await Promise.all([
      supabase.from("sites").select("name, subdomain").eq("id", id).maybeSingle(),
      supabase.rpc("lead_new_notification_recipients", { p_site: id }),
    ]);
    if (site.error || !site.data || recipients.error) {
      console.error("Could not load test notification recipients", { siteId: id, code: recipients.error?.code ?? site.error?.code });
      return { error: "Could not load notification recipients." };
    }
    const addresses = z.array(z.email().max(254)).max(50).safeParse(recipients.data);
    if (!addresses.success || !addresses.data.length) {
      console.error("Lead test notification could not be sent: no eligible recipients", { siteId: id });
      return { error: "No eligible recipients. Check recipients, personal preferences and suppressed addresses." };
    }
    const reservation = await supabase.rpc("reserve_lead_notification_test", { p_site: id });
    if (reservation.error) {
      console.error("Could not reserve lead test notification", { siteId: id, code: reservation.error.code });
      return { error: "Could not send the test notification." };
    }
    if (!reservation.data) return { error: "Please wait one minute before sending another test." };
    const body = await renderLeadTestEmail(site.data.name || site.data.subdomain, id);
    const results = await Promise.allSettled(addresses.data.map((to) => sendEmail({
      to, ...body, tag: "form-notification", metadata: { site_id: id },
    })));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) {
      const error = failures[0].reason;
      const reason = error instanceof EmailDeliveryError ? error.message : "Unexpected email error.";
      console.error("Lead test notification could not be sent", { siteId: id, failures: failures.length, reason });
      return { error: `${failures.length} of ${addresses.data.length} test notifications failed: ${reason}` };
    }
    return { error: "", success: `Test notification sent to ${addresses.data.length} ${addresses.data.length === 1 ? "recipient" : "recipients"}.` };
  } else if (intent === "notifications") {
    const seed = await table.upsert({ site_id: id }, { ignoreDuplicates: true });
    const error = seed.error ?? (await table.update({
      new_lead_enabled: form.get("new_lead_enabled") === "on",
      reply_notifications_enabled: form.get("reply_notifications_enabled") === "on",
      digest_enabled: form.get("digest_enabled") === "on",
    }).eq("site_id", id)).error;
    if (error) {
      console.error("Could not save site notification controls", { code: error.code });
      return { error: "Could not save notification controls." };
    }
  } else if (intent === "limit") {
    const admin = await supabase.rpc("is_super_admin");
    if (admin.error || admin.data !== true) return { error: "Only the agency can change the daily limit." };
    const limit = z.string().regex(/^\d{1,5}$/).transform(Number).pipe(z.number().int().min(0).max(10000)).safeParse(form.get("daily_limit"));
    if (!limit.success) return { error: "Enter a whole number between 0 and 10,000." };
    const site = await supabase.from("sites").select("account_id").eq("id", id).single();
    if (site.error) return { error: "Could not load this client's account." };
    const { error } = await supabase.from("lead_send_limits").upsert({ account_id: site.data.account_id, daily_limit: limit.data });
    if (error) {
      console.error("Could not save lead reply limit", { code: error.code });
      return { error: "Could not save the daily reply limit." };
    }
  } else if (intent === "reply_mode") {
    const mode = z.enum(["tracked", "direct"]).safeParse(form.get("reply_mode"));
    if (!mode.success) return { error: "Choose a reply delivery mode." };
    const seed = await table.upsert({ site_id: id }, { ignoreDuplicates: true });
    const error = seed.error ?? (await table.update({ reply_mode: mode.data }).eq("site_id", id)).error;
    if (error) {
      console.error("Could not save lead reply routing", { code: error.code });
      return { error: "Could not save reply delivery settings." };
    }
  } else if (intent === "preferences") {
    const prefs = supabase.from("lead_notification_preferences");
    const seed = await prefs.upsert({ site_id: id, user_id: user.id }, { onConflict: "site_id,user_id", ignoreDuplicates: true });
    const error = seed.error ?? (await prefs.update({
      new_lead: form.get("new_lead") === "on",
      replies: form.get("replies") === "on", digest: form.get("digest") === "on",
    }).eq("site_id", id).eq("user_id", user.id)).error;
    if (error) {
      console.error("Could not save lead email preferences", { code: error.code });
      return { error: "Could not save your email preferences." };
    }
  } else if (intent === "recipients") {
    const addresses = z.string().max(6500).safeParse(form.get("recipients"));
    const recipients = addresses.success && recipientsSchema.safeParse(
      [...new Set(addresses.data.toLowerCase().split(/[,;\n]/).map((email) => email.trim()).filter(Boolean))],
    );
    if (!recipients || !recipients.success) return { error: "Enter up to 25 valid email addresses, separated by commas or new lines." };
    const seed = await table.upsert({ site_id: id }, { ignoreDuplicates: true });
    const error = seed.error ?? (await table.update({ recipients: recipients.data }).eq("site_id", id)).error;
    if (error) {
      console.error("Could not save lead recipients", { code: error.code });
      return { error: "Could not save notification recipients." };
    }
  } else {
    const raw = z.string().trim().max(2048).safeParse(form.get("url"));
    const url = raw.success && raw.data ? URL.parse(raw.data) : null;
    if (!raw.success || (raw.data && (!url || !isPublicHttpsUrl(url) || url.hash || url.href.length > 2048))) {
      return { error: "Enter a public HTTPS webhook URL without a fragment, credentials or a custom port." };
    }
    const { data: current, error: settingsError } = await table.select("webhook_url, webhook_secret").eq("site_id", id).maybeSingle();
    if (settingsError) {
      console.error("Could not load current lead webhook", { code: settingsError.code });
      return { error: "Could not load the current webhook settings." };
    }
    const seed = await table.upsert({ site_id: id }, { ignoreDuplicates: true });
    const error = seed.error ?? (await table.update({
      webhook_url: url?.href ?? null,
      webhook_secret: url ? (current?.webhook_url === url.href && form.get("rotate") !== "on" ? current.webhook_secret
        : randomBytes(32).toString("hex")) : null,
    }).eq("site_id", id)).error;
    if (error) {
      console.error("Could not save lead webhook", { code: error.code });
      return { error: "Could not save the webhook settings." };
    }
  }
  return saved(id);
}
