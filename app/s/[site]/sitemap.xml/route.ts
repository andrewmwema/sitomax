import { getPublishedSitePages, getSiteByHost } from "@/lib/tenant";
import { canonicalUrl, parsePageSeo, parseSiteSeo } from "@/lib/seo-public";
import { isNoindex } from "@/lib/seo";

export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const site = await getSiteByHost((await params).site);
  if (!site) return new Response("Not found", { status: 404 });
  const seo = parseSiteSeo(site);
  const pages = await getPublishedSitePages(site.id);
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const entries = pages.filter((page) => !isNoindex(parsePageSeo(page.seo), seo)).map((page) =>
    `<url><loc>${escape(canonicalUrl(site, page.slug))}</loc>${page.published_at ? `<lastmod>${escape(new Date(page.published_at).toISOString())}</lastmod>` : ""}</url>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
