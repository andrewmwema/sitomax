import { Suspense } from "react";
import { z } from "zod";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { PageEditor } from "@/components/editor/page-editor";
import type { SiteTheme } from "@/lib/theme/presets";
import { businessSchema, emptyBusiness } from "@/lib/business";
import { siteSeoSchema } from "@/lib/seo";
import { seoChecklist } from "@/lib/seo-checklist";
import { pageSections } from "@/lib/links";
import type { SeoPageSummary } from "@/components/editor/seo-panel";
import { headerMigrationMissing } from "@/lib/header";
import { loadEditorBlogFeed } from "@/lib/blog-editor-feed";
import { hasUnpublishedFooterChanges, hasUnpublishedPageChanges } from "@/lib/publishing";

/**
 * Full-screen visual editor for a page.
 *
 * Access control happens on the server: the page + site are loaded with
 * the user-scoped Supabase client, so RLS only returns a row when the
 * user is a member of the site's account or the super admin.
 */
export default function EditorPage({ params }: PageProps<"/editor/[pageId]">) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-sm text-zinc-500">
          Loading editor…
        </div>
      }
    >
      <EditorLoader params={params} />
    </Suspense>
  );
}

type EditorSite = {
  id: string;
  account_id: string;
  name: string | null;
  subdomain: string;
  custom_domain: string | null;
  domain_verified: boolean;
  theme: SiteTheme | null;
  draft_theme: SiteTheme | null;
  draft_header: unknown;
  published_header?: unknown;
  business: unknown;
  seo: unknown;
};

async function EditorLoader({
  params,
}: {
  params: PageProps<"/editor/[pageId]">["params"];
}) {
  const { pageId } = await params;
  const { supabase, user } = await requireUser();

  const [loaded, { data: profile }] = await Promise.all([
    supabase
      .from("pages")
      .select(
        "id, slug, title, seo, draft_data, published_data, site:sites(id, account_id, name, subdomain, custom_domain, domain_verified, theme, draft_theme, draft_header, published_header, business, seo)",
      )
      .eq("id", pageId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const headersReady = !headerMigrationMissing(loaded.error);
  if (!headersReady) console.warn("Global header migration is not applied; the editor is preserving per-page Navigation.");
  const result = headersReady ? loaded : await supabase.from("pages").select(
    "id, slug, title, seo, draft_data, published_data, site:sites(id, account_id, name, subdomain, custom_domain, domain_verified, theme, draft_theme, business, seo)",
  ).eq("id", pageId).maybeSingle();
  if (result.error) throw new Error("Unable to load the editor.", { cause: result.error });
  const data = result.data;

  if (!data) {
    // No row = page missing or the user is not a member (RLS).
    notFound();
  }

  // supabase-js types to-one joins as arrays without generated DB types.
  const site = data.site as unknown as EditorSite;
  const siteSeo = siteSeoSchema.parse(site.seo);
  const [listed, blogFeed, owner] = await Promise.all([
    supabase.from("pages").select("id, slug, title, nav_label, hide_from_menu, ai_pending_build, draft_data, published_data, seo, published_at")
      .eq("site_id", site.id).order("sort_order").order("slug"),
    loadEditorBlogFeed(supabase, site).catch((error: unknown) => {
      console.error("Could not load the blog feed preview.", { siteId: site.id, error });
      return { siteBlogFeedUnavailable: true };
    }),
    supabase.rpc("is_account_owner", { acc: site.account_id }),
  ]);
  if (owner.error) throw new Error("Unable to check domain permissions.", { cause: owner.error });
  const menuLabelsReady = listed.error?.code !== "42703";
  if (!menuLabelsReady) console.warn("Page menu labels migration is not applied; the editor is using labels from slugs.");
  const { data: sitePages, error: pagesError } = menuLabelsReady ? listed : await supabase.from("pages")
    .select("id, slug, title, draft_data, published_data, seo, published_at").eq("site_id", site.id).order("sort_order").order("slug");
  if (pagesError) throw new Error("Unable to load site pages", { cause: pagesError });
  const seoPages: SeoPageSummary[] = (sitePages ?? []).map((page) => {
    const { checks, score } = seoChecklist(page.draft_data, page.title, siteSeo, page.seo);
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      score,
      hidden: !checks.find((check) => check.key === "indexing")?.complete,
      hasPlaceholders: !checks.find((check) => check.key === "placeholders")?.complete,
    };
  });

  const path = data.slug ? `/${data.slug}` : "/";
  const previewUrl = `${brand.appUrl}/s/${site.subdomain}${path}?preview=1`;
  const generated = z.object({
    root: z.object({ props: z.object({ generationWarnings: z.array(z.string()).optional() }).optional() }).optional(),
  }).safeParse(data.draft_data);
  const savedSeo = z.object({
    image: z.string().optional(), noindex: z.boolean().nullable().optional(),
  }).safeParse(data.seo).data;
  const draft = z.object({ root: z.object({ props: z.record(z.string(), z.unknown()).optional() }).passthrough().optional() })
    .passthrough().parse(data.draft_data);
  const draftProps = draft.root?.props ?? {};
  const initialData = { ...draft, root: { ...draft.root, props: {
    ...(savedSeo?.image !== undefined && draftProps.socialImage === undefined ? { socialImage: savedSeo.image } : {}),
    ...(savedSeo?.noindex !== undefined && draftProps.indexing === undefined
      ? { indexing: savedSeo.noindex === null ? "inherit" : savedSeo.noindex ? "noindex" : "index" } : {}),
    ...draftProps,
  } } };

  return (
    <PageEditor
      key={data.id}
      page={{ id: data.id, slug: data.slug, title: data.title }}
      site={{ ...site, theme: site.draft_theme ?? site.theme }}
      siteSeo={siteSeo}
      business={businessSchema.parse({ ...emptyBusiness, ...(site.business as object) })}
      initialData={initialData}
      publishedData={data.published_data}
      previewUrl={previewUrl}
      blogFeed={blogFeed}
      isSuperAdmin={Boolean(profile?.is_super_admin)}
      canManageDomains={Boolean(profile?.is_super_admin || owner.data)}
      headersReady={headersReady}
      userId={user.id}
      sitePages={(sitePages ?? []).map((page) => ({ id: page.id, slug: page.slug, title: page.title,
        nav_label: "nav_label" in page && typeof page.nav_label === "string" ? page.nav_label : null,
        hide_from_menu: "hide_from_menu" in page && page.hide_from_menu === true,
        ai_pending_build: "ai_pending_build" in page && page.ai_pending_build === true,
        sections: pageSections(page.draft_data), published: page.published_data !== null,
        hasUnpublishedChanges: hasUnpublishedPageChanges(page.draft_data, page.published_data),
        footerChanged: hasUnpublishedFooterChanges(page.draft_data, page.published_data) }))}
      seoPages={seoPages}
      pendingSiteChanges={{
        headerChanged: headersReady && site.draft_header != null &&
          JSON.stringify(site.draft_header) !== JSON.stringify(site.published_header),
        themeChanged: site.draft_theme != null && JSON.stringify(site.draft_theme) !== JSON.stringify(site.theme),
        blogSettingsChanged: blogFeed.siteBlogSettingsPending === true,
      }}
      generationWarnings={generated.data?.root?.props?.generationWarnings ?? []}
    />
  );
}
