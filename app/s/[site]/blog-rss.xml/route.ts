import { getPublicBlogData, blogPostUrl, blogPublicPath, escapeXml } from "@/lib/blog-public";
import { getSiteByHost, getSiteUrl } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const site = await getSiteByHost((await params).site);
  if (!site) return new Response("Not found", { status: 404 });
  const { settings, posts } = await getPublicBlogData(site.id);
  const requestPath = new URL(request.url).searchParams.get("blogPath");
  if (!settings.available || requestPath !== blogPublicPath(settings.blog_path)) {
    return new Response("Not found", { status: 404 });
  }
  const siteUrl = getSiteUrl(site);
  const blogUrl = new URL(blogPublicPath(settings.blog_path), siteUrl).toString();
  const items = posts.map((post) => {
    const metadata = post.publication.metadata;
    const url = blogPostUrl(site, settings.blog_path, post);
    return `<item><title>${escapeXml(metadata.title)}</title><link>${escapeXml(url)}</link><guid isPermaLink="true">${escapeXml(url)}</guid><description>${escapeXml(metadata.excerpt)}</description><pubDate>${escapeXml(new Date(post.published_at).toUTCString())}</pubDate>${metadata.author ? `<author>${escapeXml(metadata.author.name)}</author>` : ""}</item>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(site.name || site.subdomain)} Blog</title><link>${escapeXml(blogUrl)}</link><description>${escapeXml(site.name || site.subdomain)} blog posts</description>${items}</channel></rss>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
