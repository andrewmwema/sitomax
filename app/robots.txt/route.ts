import { GET as getTenantRobots } from "@/app/s/[site]/robots.txt/route";
import { isAppHost } from "@/lib/platform-host";
import { getRootDomain, getTenantKeyFromHost } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (isAppHost(host, getRootDomain())) {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const site = getTenantKeyFromHost(host);
  if (!site) return new Response("Not found", { status: 404 });
  return getTenantRobots(request, { params: Promise.resolve({ site }) });
}
