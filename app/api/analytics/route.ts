import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { beaconSchema, deviceFromUserAgent, referrerOrigin } from "@/lib/analytics";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteByHost, getTenantKeyFromHost } from "@/lib/tenant";
import { readTextBody } from "@/lib/request-body";
import { isAnalyticsSaltValid } from "@/lib/analytics-config";

export async function POST(request: Request) {
  const host = request.headers.get("host") ?? "";
  const key = getTenantKeyFromHost(host);
  if (!key) return new Response(null, { status: 404 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const text = await readTextBody(request, 8192);
  if (text === null) return new Response(null, { status: 413 });
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = beaconSchema.safeParse(input);
  if (!parsed.success) return new Response(null, { status: 400 });

  const salt = process.env.ANALYTICS_HASH_SALT;
  if (!isAnalyticsSaltValid(salt)) return new Response(null, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!isIP(ip)) {
    console.error("Analytics is unavailable: the client IP header is missing or invalid.");
    return new Response(null, { status: 503 });
  }
  const site = await getSiteByHost(key);
  if (!site) return new Response(null, { status: 404 });

  const supabase = createAdminClient();
  const { blogPostId } = parsed.data;
  if (blogPostId) {
    const { data: post, error } = await supabase.from("posts").select("id")
      .eq("site_id", site.id).eq("id", blogPostId).eq("status", "published").not("published_content", "is", null).maybeSingle();
    if (error) {
      console.error("Could not validate analytics blog post", { code: error.code });
      return new Response(null, { status: 500 });
    }
    if (!post) return new Response(null, { status: 404 });
  }

  const agent = (request.headers.get("user-agent") ?? "").slice(0, 1024);
  const day = new Date().toISOString().slice(0, 10);
  const visitorHash = createHash("sha256").update(JSON.stringify([ip, agent, day, salt, site.id])).digest("hex");
  const country = request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? "";
  const { error } = await supabase.from("page_views").insert({
    site_id: site.id,
    path: parsed.data.path,
    ...(blogPostId ? { blog_post_id: blogPostId } : {}),
    referrer: referrerOrigin(parsed.data.referrer, host),
    device: deviceFromUserAgent(agent),
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    visitor_hash: visitorHash,
  });
  if (error) {
    console.error("Could not record analytics page view:", error.message);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
