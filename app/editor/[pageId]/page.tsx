import { Suspense } from "react";
import { z } from "zod";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageEditor } from "@/components/editor/page-editor";
import type { SiteTheme } from "@/lib/theme/presets";
import { businessSchema, emptyBusiness } from "@/lib/business";

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
  theme: SiteTheme | null;
  draft_theme: SiteTheme | null;
  business: unknown;
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
        "id, slug, title, draft_data, site:sites(id, account_id, name, subdomain, theme, draft_theme, business)",
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
  const { data: sitePages, error: pagesError } = await supabase.from("pages")
    .select("id, slug, title").eq("site_id", site.id).order("sort_order");
  if (pagesError) throw new Error("Unable to load site pages", { cause: pagesError });

  // Preview always uses the subdomain URL: auth cookies are scoped to the
  // root domain, so they are sent to subdomains but never custom domains.
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const protocol = root.includes("localhost") ? "http" : "https";
  const path = data.slug ? `/${data.slug}` : "/";
  const previewUrl = `${protocol}://${site.subdomain}.${root}${path}?preview=1`;
  const generated = z.object({
    root: z.object({ props: z.object({ generationWarnings: z.array(z.string()).optional() }).optional() }).optional(),
  }).safeParse(data.draft_data);

  return (
    <PageEditor
      key={data.id}
      page={{ id: data.id, slug: data.slug, title: data.title }}
      site={{ ...site, theme: site.draft_theme ?? site.theme }}
      business={businessSchema.parse({ ...emptyBusiness, ...(site.business as object) })}
      initialData={data.draft_data as Record<string, unknown>}
      previewUrl={previewUrl}
      isSuperAdmin={Boolean(profile?.is_super_admin)}
      userId={user.id}
      sitePages={sitePages ?? []}
      generationWarnings={generated.data?.root?.props?.generationWarnings ?? []}
    />
  );
}
