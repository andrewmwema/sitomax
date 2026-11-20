import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core/rsc";
import { linkContext, resolveDataLinks } from "@/lib/links";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import type { SiteTheme } from "@/lib/theme/presets";
import { TenantFontHints } from "@/components/tenant-font-hints";
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import { TenantTracking } from "@/components/tenant-tracking";
import { localBusinessJsonLd, parseSiteSeo, publicPageSeo } from "@/lib/seo-public";
import { absoluteImage, rootSeoSchema } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import { businessSchema, emptyBusiness } from "@/lib/business";
import { pageMenuLinks, siteContacts, type SiteMenu } from "@/lib/page-navigation";
import { defaultHeader, headerSchema } from "@/lib/header";
import { slugify } from "@/lib/page-slugs";
import {
  blogMetadata, blogPostUrl, blogPublicPath, getPublicBlogData, getPublicBlogSettings, getPublishedBlogPosts,
  parseBlogRoute, selectBlogPosts,
  type BlogRoute, type PublicBlogPost, type PublicBlogSettings,
} from "@/lib/blog-public";
import type { BlogArchiveProps } from "@/components/blocks/blog-archive";
import {
  getSiteByHost,
  getSitePage,
  getSiteUrl,
  getTenantLinkPages,
  getTenantMenuPages,
  type TenantPage,
  type TenantSite,
} from "@/lib/tenant";

/**
 * PUBLIC tenant site renderer. Reached only via the proxy rewrite:
 *   {subdomain}.ROOT_DOMAIN/{path}  ->  /s/{subdomain}/{path}
 *   {custom-domain}/{path}          ->  /s/{custom-domain}/{path}
 *
 * Renders pages.published_data with Puck. The site theme is passed as
 * Puck metadata and applied as CSS variables by the config's root.
 *
 * ?preview=1 renders draft_data instead, but only for signed-in members
 * of the site's account (verified through RLS with the user's session).
 */

type Props = PageProps<"/s/[site]/[[...slug]]">;

/**
 * Site and page RLS return a row only to the site's team or a super admin.
 */
const checkSiteContentAccess = cache(async (table: "pages" | "sites", id: string): Promise<{ allowed: boolean; failed: boolean }> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("Could not check site content access:", error.message);
  return { allowed: Boolean(data), failed: Boolean(error) };
});

async function loadPage(
  params: Props["params"],
  searchParams: Props["searchParams"],
): Promise<{
  site: TenantSite;
  page: TenantPage;
  data: Record<string, unknown>;
  isPreview: boolean;
} | null> {
  const [{ site: siteParam, slug }, { preview }] = await Promise.all([
    params,
    searchParams,
  ]);

  const site = await getSiteByHost(siteParam);
  if (!site) return null;

  const page = await getSitePage(site.id, slug?.join("/") ?? "");
  if (!page) return null;

  const isPreview =
    preview === "1" && page.draft_data != null && (await checkSiteContentAccess("pages", page.id)).allowed;
  const data = isPreview ? page.draft_data : page.published_data;
  if (!data) return null;

  return { site, page, data, isPreview };
}

type LoadedBlogPage = {
  site: TenantSite;
  settings: PublicBlogSettings;
  posts: PublicBlogPost[];
  allPosts: PublicBlogPost[];
  route: BlogRoute;
  currentPost?: PublicBlogPost;
  previousPost?: PublicBlogPost;
  nextPost?: PublicBlogPost;
  relatedPosts: PublicBlogPost[];
  page: number;
  pages: number;
  total: number;
  title: string;
  postUrl?: string;
};

async function loadBlogPage(params: Props["params"], searchParams: Props["searchParams"]): Promise<LoadedBlogPage | null> {
  const [{ site: siteParam, slug }, query] = await Promise.all([params, searchParams]);
  const site = await getSiteByHost(siteParam);
  if (!site) return null;
  const settings = await getPublicBlogSettings(site.id);
  if (!settings.available) return null;
  const route = parseBlogRoute(slug ?? [], settings.blog_path, query);
  if (!route) return null;
  const posts = await getPublishedBlogPosts(site.id);
  if (route.kind === "post") {
    const index = posts.findIndex((post) => post.slug === route.slug);
    if (index < 0) return { site, settings, posts, allPosts: posts, route, relatedPosts: [], page: 1, pages: 1, total: 0, title: "" };
    const currentPost = posts[index];
    const relatedPosts = posts.filter((post) => post.id !== currentPost.id &&
      ((currentPost.publication.metadata.category?.slug &&
        post.publication.metadata.category?.slug === currentPost.publication.metadata.category.slug) ||
       post.tags.some((tag) => currentPost.tags.some((currentTag) => currentTag.slug === tag.slug))))
      .slice(0, 3);
    return {
      site, settings, posts, allPosts: posts, route, currentPost, previousPost: posts[index + 1], nextPost: posts[index - 1],
      relatedPosts, page: 1, pages: 1, total: 1,
      title: currentPost.publication.metadata.title, postUrl: blogPostUrl(site, settings.blog_path, currentPost),
    };
  }
  const selection = selectBlogPosts(posts, route, settings.posts_per_page);
  const page = Math.min(route.page, selection.pages);
  const adjustedRoute = { ...route, page };
  let title = "Blog";
  if (route.kind === "category") {
    title = posts.find((post) => post.publication.metadata.category?.slug === route.slug)?.publication.metadata.category?.name ?? `Category: ${route.slug}`;
  } else if (route.kind === "tag") {
    title = posts.find((post) => post.tags.some((tag) => tag.slug === route.slug))?.tags.find((tag) => tag.slug === route.slug)?.name ?? `Tag: ${route.slug}`;
  } else if (route.kind === "author") {
    title = posts.find((post) => post.publication.metadata.author &&
      slugify(post.publication.metadata.author.name) === route.slug)?.publication.metadata.author?.name ?? `Author: ${route.slug}`;
  } else if (route.query) title = `Search results for “${route.query}”`;
  return {
    site, settings, posts: selection.posts, allPosts: posts, route: adjustedRoute, relatedPosts: [],
    page, pages: selection.pages, total: selection.total, title,
  };
}

function blogJsonLd(page: LoadedBlogPage) {
  const siteUrl = getSiteUrl(page.site);
  const blogUrl = new URL(blogPublicPath(page.settings.blog_path), siteUrl).toString();
  const post = page.currentPost;
  const metadata = post?.publication.metadata;
  const article = post ? {
    "@context": "https://schema.org", "@type": "BlogPosting",
    headline: metadata?.title, description: metadata?.excerpt || undefined,
    datePublished: post.published_at, dateModified: post.published_at,
    mainEntityOfPage: page.postUrl,
    ...(metadata?.cover_image ? { image: absoluteImage(metadata.cover_image, siteUrl) } : {}),
    ...(metadata?.author ? { author: { "@type": "Person", name: metadata.author.name } } : {}),
    publisher: { "@type": "Organization", name: page.site.name || page.site.subdomain, url: siteUrl },
  } : null;
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Blog", item: blogUrl },
      ...(post ? [{ "@type": "ListItem", position: 3, name: metadata?.title ?? "", item: page.postUrl }] : []),
    ],
  };
  return [article, breadcrumb].filter(Boolean).map((value) => JSON.stringify(value).replace(/</g, "\\u003c"));
}

function extractHomepageFooters(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object" || !("content" in data) || !Array.isArray(data.content)) return [];
  return data.content.filter((block): block is Record<string, unknown> =>
    Boolean(block) && typeof block === "object" && "type" in block && block.type === "Footer");
}

async function renderBlogPage(page: LoadedBlogPage, params: Props["params"], searchParams: Props["searchParams"]) {
  const { site, settings, route } = page;
  if (route.kind === "post" && !page.currentPost) notFound();
  if (route.kind !== "post" && route.kind !== "index" && page.total === 0) notFound();
  const [{ site: siteParam }, { preview }] = await Promise.all([params, searchParams]);
  const blogPostId = page.currentPost?.id;
  const previewPrefix = preview === "1" ? `/s/${encodeURIComponent(siteParam)}` : "";
  const theme = (site.theme ?? {}) as SiteTheme;
  const seo = parseSiteSeo(site);
  const [menuPages, linkPages, homePage, access] = await Promise.all([
    getTenantMenuPages(site.id, false),
    getTenantLinkPages(site.id, false),
    getSitePage(site.id, ""),
    preview !== "1" && blogPostId ? checkSiteContentAccess("sites", site.id) : null,
  ]);
  const contacts = siteContacts(businessSchema.parse({ ...emptyBusiness, ...site.business }));
  const siteMenu: SiteMenu = { links: pageMenuLinks(menuPages, previewPrefix), contacts };
  const rawHeader = site.published_header;
  const siteHeader = site.headers_ready === false ? undefined :
    rawHeader ? headerSchema.parse(rawHeader) : defaultHeader(contacts.businessName || site.name || "", theme.logoUrl);
  const postIndex = page.currentPost ? page.allPosts.findIndex((post) => post.id === page.currentPost?.id) : -1;
  const archiveProps: BlogArchiveProps = {
    blogPath: blogPublicPath(settings.blog_path),
    route,
    settings,
    posts: page.posts,
    allPosts: page.allPosts,
    ...(page.currentPost ? { currentPost: page.currentPost } : {}),
    ...(postIndex >= 0 ? { previousPost: page.allPosts[postIndex + 1], nextPost: page.allPosts[postIndex - 1] } : {}),
    relatedPosts: page.relatedPosts,
    total: page.total,
    pages: page.pages,
    page: page.page,
    query: route.query,
    title: page.title,
    siteUrl: getSiteUrl(site),
    ...(page.postUrl ? { postUrl: page.postUrl } : {}),
  };
  const footerBlocks = extractHomepageFooters(homePage?.published_data);
  const footerContent = footerBlocks.length ? footerBlocks : [{
    type: "Footer",
    props: { businessName: contacts.businessName || site.name || "", phone: contacts.phone, address: contacts.address,
      email: contacts.email, hours: contacts.openingHours, socialLinks: [], navigation: [], variant: "columns" },
    id: "blog-fallback-footer",
  }];
  const footerData = resolveDataLinks({ root: {}, content: footerContent }, linkContext(linkPages));
  const content = [{
    type: "BlogPosts",
    props: {
      source: "latest", category: "", count: 10, variant: "grid", showExcerpt: true, showDate: true,
      showAuthor: true, showViewAll: false, archiveData: archiveProps,
    },
    id: "blog-public-view",
  }, ...footerData.content];
  const data = { root: { props: {} }, content };
  const jsonLd = blogJsonLd(page);
  return <>
    <TenantFontHints />
    {jsonLd.map((json, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />)}
    {preview !== "1" ? <TenantTracking seo={seo} /> : null}
    {blogPostId && access && !access.allowed && !access.failed ? <AnalyticsBeacon key={blogPostId} blogPostId={blogPostId} /> : null}
    <Render config={puckConfig} data={data as unknown as PuckPageData}
      metadata={{
        theme, siteMenu, siteHeader, siteLinks: linkContext(linkPages),
        pagePath: `${previewPrefix}${blogPublicPath(settings.blog_path, route.kind === "post" ? route.slug : route.kind === "index" ? "" : `${route.kind}/${route.slug}`)}`,
      }}
      fieldTransforms={{ richtext: ({ value }) => value }} />
  </>;
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const blog = await loadBlogPage(params, searchParams);
  if (blog) return blogMetadata(blog.site, blog.settings, blog.route, blog.currentPost, blog.title);
  const loaded = await loadPage(params, searchParams);
  if (!loaded) return {};

  const { site, page } = loaded;
  const root = loaded.data.root;
  const preview = loaded.isPreview && root && typeof root === "object" && "props" in root
    ? rootSeoSchema.safeParse(root.props) : null;
  const previewSeo = preview?.success ? {
    title: preview.data.seoTitle || preview.data.title,
    description: preview.data.description,
    image: preview.data.socialImage,
    noindex: true,
  } : page.seo;
  const seo = publicPageSeo(site, { ...page, seo: previewSeo });
  const tenantIcon = typeof site.theme?.logoUrl === "string"
    ? absoluteImage(site.theme.logoUrl, seo.canonical)
    : undefined;

  return {
    metadataBase: new URL(seo.canonical),
    title: seo.title, description: seo.description,
    alternates: { canonical: seo.canonical },
    openGraph: { type: "website", siteName: site.name || site.subdomain, title: seo.title, description: seo.description, url: seo.canonical, ...(seo.image ? { images: [seo.image] } : {}) },
    twitter: { card: seo.image ? "summary_large_image" : "summary", title: seo.title, description: seo.description, ...(seo.image ? { images: [seo.image] } : {}) },
    icons: { icon: tenantIcon ?? "/globe.svg" },
    robots: { index: !loaded.isPreview && !seo.noindex, follow: true },
    ...(seo.verification ? { verification: { google: seo.verification } } : {}),
  };
}

export default async function TenantSitePage({ params, searchParams }: Props) {
  const blog = await loadBlogPage(params, searchParams);
  if (blog) return renderBlogPage(blog, params, searchParams);
  const loaded = await loadPage(params, searchParams);
  if (!loaded) notFound();

  const { site, page, data, isPreview } = loaded;
  const { preview } = await searchParams;
  const access = preview !== "1" ? await checkSiteContentAccess("pages", page.id) : null;
  const track = access !== null && !access.allowed && !access.failed;
  const theme = ((isPreview ? site.draft_theme ?? site.theme : site.theme) ?? {}) as SiteTheme;
  const seo = parseSiteSeo(site);
  const jsonLd = JSON.stringify(localBusinessJsonLd(site)).replace(/</g, "\\u003c");
  const [menuPages, linkPages] = await Promise.all([
    getTenantMenuPages(site.id, isPreview),
    getTenantLinkPages(site.id, isPreview),
  ]);
  const contacts = siteContacts(businessSchema.parse({ ...emptyBusiness, ...site.business }));
  const previewPrefix = isPreview ? `/s/${encodeURIComponent((await params).site)}` : "";
  const siteMenu: SiteMenu = { links: pageMenuLinks(menuPages, previewPrefix), contacts };
  const rawHeader = isPreview ? site.draft_header : site.published_header;
  const siteHeader = site.headers_ready === false ? undefined :
    rawHeader ? headerSchema.parse(rawHeader) : defaultHeader(contacts.businessName || site.name || "", theme.logoUrl);
  // Typed page links are stored by id and resolved to current slugs here, so renames never break them.
  const pageData = resolveDataLinks({ content: [], root: {}, ...data }, linkContext(linkPages, previewPrefix));
  const hasBlogPosts = hasBlockType(pageData.content, "BlogPosts");
  const blogFeedMetadata = hasBlogPosts ? await getPublicBlogData(site.id) : null;

  return (
    <>
      <TenantFontHints />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      {preview !== "1" ? <TenantTracking seo={seo} /> : null}
      {track ? <AnalyticsBeacon key={page.id} /> : null}
      {isPreview ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          Preview — showing unpublished draft
        </div>
      ) : null}
      <Render
        config={puckConfig}
        data={pageData as unknown as PuckPageData}
        metadata={{ theme, siteMenu, siteHeader, siteLinks: linkContext(linkPages, previewPrefix), pagePath: `${previewPrefix}/${page.slug}`,
          ...(blogFeedMetadata ? { siteBlogPosts: blogFeedMetadata.posts, siteBlogPath: blogPublicPath(blogFeedMetadata.settings.blog_path),
            siteBlogTimezone: blogFeedMetadata.settings.timezone } : {}) }}
        // Disable Puck's default richtext transform (it injects the raw
        // HTML unsanitized); pass the string through so blocks render it
        // via <RichTextContent>, which sanitizes with DOMPurify.
        fieldTransforms={{ richtext: ({ value }) => value }}
      />
    </>
  );
}

function hasBlockType(content: unknown, type: string): boolean {
  if (Array.isArray(content)) return content.some((block: unknown) => hasBlockType(block, type));
  if (!content || typeof content !== "object") return false;
  if ("type" in content && content.type === type) return true;
  return Object.values(content).some((value) => hasBlockType(value, type));
}
