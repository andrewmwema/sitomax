import { getPublishedSitePages, getSiteByHost } from "@/lib/tenant";
import { canonicalUrl, parsePageSeo, parseSiteSeo } from "@/lib/seo-public";
import { isNoindex } from "@/lib/seo";
import { getPublicBlogData, blogPostUrl, blogPublicPath, escapeXml } from "@/lib/blog-public";

export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const site = await getSiteByHost((await params).site);
  if (!site) return new Response("Not found", { status: 404 });
  const seo = parseSiteSeo(site);
  const [pages, blog] = await Promise.all([getPublishedSitePages(site.id), getPublicBlogData(site.id)]);
  const blogIndexSlug = blog.settings.available ? blogPublicPath(blog.settings.blog_path).slice(1) : null;
  const entries = pages.filter((page) => page.slug !== blogIndexSlug && !isNoindex(parsePageSeo(page.seo), seo)).map((page) =>
    `<url><loc>${escapeXml(canonicalUrl(site, page.slug))}</loc>${page.published_at ? `<lastmod>${escapeXml(new Date(page.published_at).toISOString())}</lastmod>` : ""}</url>`);
  if (blog.settings.available && !isNoindex({ noindex: undefined }, seo)) {
    const blogPath = blogPublicPath(blog.settings.blog_path);
    entries.push(`<url><loc>${escapeXml(new URL(blogPath, canonicalUrl(site, "")).toString())}</loc></url>`);
    for (const post of blog.posts) {
      if (isNoindex({ noindex: post.publication.metadata.noindex ? true : undefined }, seo)) continue;
      entries.push(`<url><loc>${escapeXml(blogPostUrl(site, blog.settings.blog_path, post))}</loc><lastmod>${escapeXml(new Date(post.published_at).toISOString())}</lastmod></url>`);
    }
  }
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
