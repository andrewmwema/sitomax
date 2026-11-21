import { cache } from "react";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { blogPublicationSchema, blogSlugify, sanitizeBlogContent, type BlogPublication } from "@/lib/blog";
import { blogPublicPath } from "@/lib/blog-navigation";
import { absoluteImage, isNoindex, siteFavicon } from "@/lib/seo";
import { parseSiteSeo } from "@/lib/seo-public";
import { getSiteUrl } from "@/lib/site-url";
import type { TenantSite } from "@/lib/tenant";

export type PublicBlogSettings = {
  available: boolean;
  blog_path: string;
  posts_per_page: number;
  index_layout: "grid" | "list" | "magazine";
  default_post_layout: "classic" | "wide" | "minimal";
  show_author: boolean;
  show_date: boolean;
  show_reading_time: boolean;
  show_share_links: boolean;
  show_in_menu: boolean;
  noindex_tags: boolean;
  cta_text: string;
  cta_button_text: string;
  cta_link: string;
  timezone: string;
};

export type PublicBlogPost = {
  id: string;
  slug: string;
  published_at: string;
  featured: boolean;
  publication: BlogPublication;
  tags: { name: string; slug: string }[];
};

export type BlogRoute = {
  kind: "index" | "category" | "tag" | "author" | "post";
  slug: string;
  page: number;
  query: string;
};

export const getPublicBlogSettings = cache(async (siteId: string): Promise<PublicBlogSettings> => {
  const supabase = createAdminClient();
  const [settingsResult, siteResult] = await Promise.all([
    supabase.from("blog_settings").select("*").eq("site_id", siteId).maybeSingle(),
    supabase.from("sites").select("timezone").eq("id", siteId).maybeSingle(),
  ]);
  if (settingsResult.error?.code === "42P01") {
    return {
      available: false, blog_path: "/blog", posts_per_page: 10, index_layout: "grid",
      default_post_layout: "classic", show_author: true, show_date: true, show_reading_time: true,
      show_share_links: true, show_in_menu: true, noindex_tags: true, cta_text: "",
      cta_button_text: "", cta_link: "", timezone: "UTC",
    };
  }
  if (settingsResult.error) throw new Error("Could not load public blog settings.", { cause: settingsResult.error });
  if (siteResult.error) throw new Error("Could not load the site timezone.", { cause: siteResult.error });
  const row = settingsResult.data ?? {};
  return {
    available: true,
    blog_path: typeof row.blog_path === "string" ? row.blog_path : "/blog",
    posts_per_page: typeof row.posts_per_page === "number" ? row.posts_per_page : 10,
    index_layout: row.index_layout === "list" || row.index_layout === "magazine" ? row.index_layout : "grid",
    default_post_layout: row.default_post_layout === "wide" || row.default_post_layout === "minimal" ? row.default_post_layout : "classic",
    show_author: row.show_author !== false,
    show_date: row.show_date !== false,
    show_reading_time: row.show_reading_time !== false,
    show_share_links: row.show_share_links !== false,
    show_in_menu: row.show_in_menu !== false,
    noindex_tags: row.noindex_tags !== false,
    cta_text: typeof row.cta_text === "string" ? row.cta_text : "",
    cta_button_text: typeof row.cta_button_text === "string" ? row.cta_button_text : "",
    cta_link: typeof row.cta_link === "string" ? row.cta_link : "",
    timezone: typeof siteResult.data?.timezone === "string" ? siteResult.data.timezone : "UTC",
  };
});

export const getPublishedBlogPosts = cache(async (siteId: string): Promise<PublicBlogPost[]> => {
  const supabase = createAdminClient();
  const posts: PublicBlogPost[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.from("posts").select(`
      id, slug, published_at, published_content
    `).eq("site_id", siteId).eq("status", "published").not("published_content", "is", null)
      .order("published_at", { ascending: false }).order("id").range(offset, offset + 499);
    if (error) throw new Error("Could not load published blog posts.", { cause: error });
    if (!data?.length) return posts;
    offset += data.length;
    for (const row of data) {
      const parsed = blogPublicationSchema.safeParse(row.published_content);
      if (!parsed.success) {
        console.error("Ignoring invalid published blog content", { siteId, postId: row.id });
        continue;
      }
      if (typeof row.published_at !== "string") {
        console.error("Ignoring published blog post without a publication date", { siteId, postId: row.id });
        continue;
      }
      let publication: BlogPublication;
      try {
        const content = sanitizeBlogContent({ version: 1, blocks: parsed.data.blocks });
        publication = blogPublicationSchema.parse({
          ...parsed.data,
          blocks: content.blocks,
          metadata: { ...parsed.data.metadata, slug: row.slug },
        });
      } catch {
        console.error("Ignoring unsanitizable published blog content", { siteId, postId: row.id });
        continue;
      }
      const tags = publication.metadata.tags.map((tag) => typeof tag === "string"
        ? { name: tag, slug: blogSlugify(tag) }
        : tag);
      posts.push({
        id: row.id, slug: row.slug, published_at: row.published_at,
        featured: publication.metadata.featured, publication, tags,
      });
    }
  }
});

export const getPublicBlogData = cache(async (siteId: string) => {
  const [settings, posts] = await Promise.all([
    getPublicBlogSettings(siteId),
    getPublicBlogPostsIfAvailable(siteId),
  ]);
  return { settings, posts };
});

async function getPublicBlogPostsIfAvailable(siteId: string) {
  const settings = await getPublicBlogSettings(siteId);
  return settings.available ? getPublishedBlogPosts(siteId) : [];
}

export function parseBlogRoute(
  pathSegments: string[],
  blogPath: string,
  searchParams: Record<string, string | string[] | undefined>,
): BlogRoute | null {
  const prefix = blogPath.split("/").filter(Boolean);
  if (prefix.length > pathSegments.length || !prefix.every((segment, index) => segment === pathSegments[index])) return null;
  const rest = pathSegments.slice(prefix.length);
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const pageNumber = Number(rawPage);
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? Math.min(pageNumber, 10_000) : 1;
  const rawQuery = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 100) : "";
  if (!rest.length) return { kind: "index", slug: "", page, query };
  if (rest[0] === "category" && rest.length === 2) return { kind: "category", slug: rest[1], page, query: "" };
  if (rest[0] === "tag" && rest.length === 2) return { kind: "tag", slug: rest[1], page, query: "" };
  if (rest[0] === "author" && rest.length === 2) return { kind: "author", slug: rest[1], page, query: "" };
  if (rest[0] === "rss.xml") return null;
  return { kind: "post", slug: rest.join("/"), page: 1, query: "" };
}

export function selectBlogPosts(
  posts: PublicBlogPost[],
  route: BlogRoute,
  perPage: number,
): { posts: PublicBlogPost[]; total: number; pages: number } {
  let matches = posts;
  if (route.kind === "category") {
    matches = matches.filter((post) => post.publication.metadata.category?.slug === route.slug);
  } else if (route.kind === "tag") {
    matches = matches.filter((post) => post.tags.some((tag) => tag.slug === route.slug));
  } else if (route.kind === "author") {
    matches = matches.filter((post) => {
      const author = post.publication.metadata.author;
      return author !== null && blogSlugify(author.name) === route.slug;
    });
  } else if (route.kind === "index" && route.query) {
    const query = route.query.toLowerCase();
    matches = matches.filter((post) => {
      const metadata = post.publication.metadata;
      const haystack = [
        metadata.title, metadata.subtitle, metadata.excerpt, metadata.author?.name ?? "",
        metadata.category?.name ?? "", ...post.tags.map(({ name }) => name),
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }
  const total = matches.length;
  const limit = Math.max(1, Math.min(100, perPage));
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(route.page, pages);
  return { posts: matches.slice((page - 1) * limit, page * limit), total, pages };
}

export { blogPublicPath };

export function blogPostUrl(site: TenantSite, blogPath: string, post: Pick<PublicBlogPost, "slug" | "publication">) {
  const canonical = post.publication.metadata.canonical_url;
  if (canonical) return canonical;
  return new URL(blogPublicPath(blogPath, post.slug), getSiteUrl(site)).toString();
}

export function blogMetadata(
  site: TenantSite, settings: PublicBlogSettings, route: BlogRoute, post?: PublicBlogPost, routeTitle?: string,
): Metadata {
  const siteSeo = parseSiteSeo(site);
  const path = blogPublicPath(settings.blog_path, route.kind === "post" ? route.slug : route.kind === "index" ? "" : `${route.kind}/${route.slug}`);
  const queryPage = route.page > 1 ? `?page=${route.page}` : "";
  const canonical = post ? blogPostUrl(site, settings.blog_path, post)
    : new URL(`${path}${queryPage}`, getSiteUrl(site)).toString();
  const metadata = post?.publication.metadata;
  const title = metadata?.seo_title || metadata?.title ||
    (routeTitle || (route.kind === "category" ? `Category: ${route.slug}` :
      route.kind === "tag" ? `Tag: ${route.slug}` :
        route.kind === "author" ? `Author: ${route.slug}` :
          route.query ? `Search: ${route.query}` : "Blog"));
  const description = metadata?.seo_description || metadata?.excerpt || undefined;
  const image = absoluteImage(metadata?.thumbnail_image || metadata?.cover_image || siteSeo.socialImage, canonical);
  const tagNoindex = route.kind === "tag" && settings.noindex_tags;
  const noindex = metadata?.noindex === true ||
    isNoindex({ noindex: tagNoindex || Boolean(route.query) ? true : undefined }, siteSeo);
  const origin = getSiteUrl(site);
  const tenantIcon = siteFavicon(site.theme, origin);
  const rssUrl = new URL(blogPublicPath(settings.blog_path, "rss.xml"), origin).toString();
  return {
    metadataBase: new URL(origin),
    title: { absolute: title },
    ...(description ? { description } : {}),
    alternates: { canonical, types: { "application/rss+xml": rssUrl } },
    openGraph: {
      type: post ? "article" : "website", siteName: site.name || site.subdomain, title, url: canonical,
      ...(description ? { description } : {}),
      ...(image ? { images: [image] } : {}),
      ...(post?.published_at ? { publishedTime: post.published_at } : {}),
      ...(metadata?.category ? { section: metadata.category.name } : {}),
      ...(metadata?.tags.length ? { tags: metadata.tags.map((tag) => typeof tag === "string" ? tag : tag.name) } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title,
      ...(description ? { description } : {}), ...(image ? { images: [image] } : {}) },
    robots: { index: !noindex, follow: true },
    icons: { icon: tenantIcon ?? "/globe.svg" },
    ...(siteSeo.googleVerification ? { verification: { google: siteSeo.googleVerification } } : {}),
  };
}

export function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
