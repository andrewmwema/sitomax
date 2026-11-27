import "server-only";

import { z } from "zod";
import { isEmailConfigured } from "@/lib/email";
import { graderContactUrl } from "./presentation";

export type GraderHealthCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export function graderUnlockConfigurationIssues(): string[] {
  const issues: string[] = [];
  if (!z.uuid().safeParse(process.env.GRADER_LEADS_ACCOUNT_ID).success) issues.push("GRADER_LEADS_ACCOUNT_ID missing or invalid UUID");
  if (!z.uuid().safeParse(process.env.GRADER_LEADS_SITE_ID).success) issues.push("GRADER_LEADS_SITE_ID missing or invalid UUID");
  if (!z.email().safeParse(process.env.GRADER_NOTIFICATION_EMAIL?.trim()).success) issues.push("GRADER_NOTIFICATION_EMAIL missing or invalid email");
  if (!process.env.POSTMARK_SERVER_TOKEN?.trim()) issues.push("POSTMARK_SERVER_TOKEN missing");
  if (!process.env.POSTMARK_FROM_EMAIL?.trim()) issues.push("POSTMARK_FROM_EMAIL missing");
  if (!isEmailConfigured() && !issues.some((issue) => issue.startsWith("POSTMARK_"))) issues.push("Transactional email provider not configured");
  return issues;
}

export function graderConfigurationChecks(): GraderHealthCheck[] {
  const present = (value: string | undefined) => Boolean(value?.trim());
  const length = (value: string | undefined) => Boolean(value && value.length >= 32);
  const check = (name: string, ok: boolean, detail: string): GraderHealthCheck => ({ name, ok, detail });
  return [
    check("NEXT_PUBLIC_SUPABASE_URL", present(process.env.NEXT_PUBLIC_SUPABASE_URL), "Supabase project URL; required by the worker."),
    check("NEXT_PUBLIC_SUPABASE_ANON_KEY", present(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), "Supabase publishable/anon key; required by the worker."),
    check("GRADER_WORKER_SECRET", length(process.env.GRADER_WORKER_SECRET) && Buffer.byteLength(process.env.GRADER_WORKER_SECRET ?? "", "utf8") <= 512, "At least 32 characters and at most 512 UTF-8 bytes; its SHA-256 hash must match grader_config."),
    check("ANALYTICS_HASH_SALT", length(process.env.ANALYTICS_HASH_SALT), "At least 32 characters; used for IP rate limits."),
    check("NEXT_PUBLIC_TURNSTILE_SITE_KEY", present(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY), "Public Cloudflare site key; baked into the client build."),
    check("TURNSTILE_SECRET_KEY", Boolean(process.env.TURNSTILE_SECRET_KEY), "Cloudflare secret; production needs a real key for the marketing host."),
    check("GRADER_LEADS_ACCOUNT_ID", z.uuid().safeParse(process.env.GRADER_LEADS_ACCOUNT_ID).success, "UUID of the account receiving grader leads."),
    check("GRADER_LEADS_SITE_ID", z.uuid().safeParse(process.env.GRADER_LEADS_SITE_ID).success, "UUID of a site belonging to that account."),
    check("GRADER_NOTIFICATION_EMAIL", z.email().safeParse(process.env.GRADER_NOTIFICATION_EMAIL?.trim()).success, "Valid email address for lead notifications."),
    check("POSTMARK_SERVER_TOKEN", present(process.env.POSTMARK_SERVER_TOKEN), "Postmark server token for transactional and follow-up emails."),
    check("POSTMARK_FROM_EMAIL", present(process.env.POSTMARK_FROM_EMAIL), "Verified Postmark sender."),
    check("POSTMARK_MESSAGE_STREAM", true, present(process.env.POSTMARK_MESSAGE_STREAM) ? "Configured transactional stream." : "Not set; the runtime uses outbound."),
    check("CRON_SECRET", Boolean(process.env.CRON_SECRET), "Authenticates the scheduled grader job."),
    check("NEXT_PUBLIC_GRADER_CTA_URL", Boolean(graderContactUrl()), "HTTPS sales CTA; also required for follow-ups."),
    check("POSTMARK_GRADER_BROADCAST_STREAM", present(process.env.POSTMARK_GRADER_BROADCAST_STREAM), "Postmark broadcast stream for opted-in follow-ups."),
    check("GRADER_MAILING_ADDRESS", present(process.env.GRADER_MAILING_ADDRESS), "Physical mailing address in follow-up emails."),
    check("GRADER_UNSUBSCRIBE_SECRET", length(process.env.GRADER_UNSUBSCRIBE_SECRET), "Stable secret of at least 32 characters for unsubscribe links."),
    check("PAGESPEED_API_KEY", Boolean(process.env.PAGESPEED_API_KEY), "Optional PageSpeed key; requests are attempted without one."),
    check("GOOGLE_PLACES_API_KEY", Boolean(process.env.GOOGLE_PLACES_API_KEY), "Optional; enables Places checks."),
    check("ANTHROPIC_API_KEY", Boolean(process.env.ANTHROPIC_API_KEY), "Needed for AI summaries; scans can complete without it."),
    check("NEXT_PUBLIC_APP_URL", Boolean(process.env.NEXT_PUBLIC_APP_URL), "Canonical platform origin; the runtime has a domain-derived fallback."),
    check("NEXT_PUBLIC_ROOT_DOMAIN", Boolean(process.env.NEXT_PUBLIC_ROOT_DOMAIN), "Marketing domain; the runtime defaults to sitomax.com."),
    check("ROOT_DOMAIN", Boolean(process.env.ROOT_DOMAIN), "Server host routing and allowed origin; a fallback is used if unset."),
    check("MARKETING_SITE_SUBDOMAIN", Boolean(process.env.MARKETING_SITE_SUBDOMAIN), "Marketing tenant; defaults to sitomax."),
    check("NEXT_PUBLIC_AGENCY_NAME", Boolean(process.env.NEXT_PUBLIC_AGENCY_NAME), "Brand name; defaults to SitoMax."),
  ];
}
