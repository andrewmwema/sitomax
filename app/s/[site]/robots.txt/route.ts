import { getSiteByHost } from "@/lib/tenant";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const site = await getSiteByHost((await params).site);
  if (!site) return new Response("Not found", { status: 404 });
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${getSiteUrl(site)}/sitemap.xml\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
