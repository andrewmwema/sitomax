import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { contactSubmissionSchema, submissionData } from "@/lib/contact-submission";
import { readTextBody } from "@/lib/request-body";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteByHost, getTenantKeyFromHost } from "@/lib/tenant";

export async function POST(request: Request) {
  const host = request.headers.get("host") ?? "";
  const key = getTenantKeyFromHost(host);
  if (!key) return new Response("Site not found.", { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Invalid origin.", { status: 403 });
  const referrer = request.headers.get("referer");
  let referrerUrl: URL | null = null;
  if (referrer) {
    try { referrerUrl = new URL(referrer); } catch { return new Response("Invalid referrer.", { status: 400 }); }
    if (referrerUrl.origin !== new URL(request.url).origin) return new Response("Invalid referrer.", { status: 403 });
    if (referrerUrl.searchParams.get("preview") === "1") return new Response("Forms cannot be submitted in preview.", { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return new Response("Unsupported form format.", { status: 415 });
  }
  const body = await readTextBody(request, 32768);
  if (body === null) return new Response("Form is too large.", { status: 413 });
  const params = new URLSearchParams(body);
  const reserved = ["_form_name", "_website", "_page_path"];
  if (reserved.some((name) => params.getAll(name).length > 1)) return new Response("Invalid form.", { status: 400 });
  const input = contactSubmissionSchema.safeParse({
    formName: params.get("_form_name") ?? "",
    path: params.get("_page_path") ?? referrerUrl?.pathname ?? "/",
    honeypot: params.get("_website") ?? "",
    fields: [...params].filter(([name]) => !reserved.includes(name)).map(([name, value]) => ({ name, value })),
  });
  if (!input.success) return new Response("Invalid form.", { status: 400 });
  if (input.data.honeypot) return new Response("Thank you. Your message has been sent.", { status: 200 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isIP(ip) || !secret) {
    console.error("Could not verify the submission rate limit: missing client IP or server secret.");
    return new Response("Form temporarily unavailable.", { status: 503 });
  }
  const site = await getSiteByHost(key);
  if (!site) return new Response("Site not found.", { status: 404 });
  const ipHash = createHmac("sha256", secret).update(ip).digest("hex");
  const { data, error } = await createAdminClient().rpc("submit_contact_form", {
    p_site_id: site.id, p_ip_hash: ipHash, p_path: input.data.path,
    p_form_name: input.data.formName, p_data: submissionData(input.data.fields),
  });
  if (error || typeof data !== "boolean") {
    console.error("Could not save form submission:", error?.message ?? "Invalid database response.");
    return new Response("Form temporarily unavailable.", { status: 500 });
  }
  if (!data) return new Response("Too many submissions. Please try again later.", { status: 429 });
  return new Response("Thank you. Your message has been sent.");
}
