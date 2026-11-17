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
import type { SeoPageSummary } from "@/components/editor/seo-panel";

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

  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from("pages")
      .select(
        "id, slug, title, seo, draft_data, site:sites(id, account_id, name, subdomain, custom_domain, domain_verified, theme, draft_theme, business, seo)",
      )
      .eq("id", pageId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (!data) {
    // No row = page missing or the user is not a member (RLS).
    notFound();
  }

  // supabase-js types to-one joins as arrays without generated DB types.
  const site = data.site as unknown as EditorSite;
  const siteSeo = siteSeoSchema.parse(site.seo);
  const { data: sitePages, error: pagesError } = await supabase.from("pages")
    .select("id, slug, title, draft_data, seo").eq("site_id", site.id).order("sort_order");
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
      previewUrl={previewUrl}
      isSuperAdmin={Boolean(profile?.is_super_admin)}
      userId={user.id}
      sitePages={(sitePages ?? []).map(({ id, slug, title }) => ({ id, slug, title }))}
      seoPages={seoPages}
      generationWarnings={generated.data?.root?.props?.generationWarnings ?? []}
    />
  );
}
