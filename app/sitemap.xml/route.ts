import { GET as getTenantSitemap } from "@/app/s/[site]/sitemap.xml/route";
import { isAppHost } from "@/lib/platform-host";
import { getRootDomain, getTenantKeyFromHost } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (isAppHost(host, getRootDomain())) return new Response("Not found", { status: 404 });
  const site = getTenantKeyFromHost(host);
  if (!site) return new Response("Not found", { status: 404 });
  return getTenantSitemap(request, { params: Promise.resolve({ site }) });
}
