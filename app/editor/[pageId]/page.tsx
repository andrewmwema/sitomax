import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageEditor } from "@/components/editor/page-editor";
import type { SiteTheme } from "@/lib/puck/theme";

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
  name: string | null;
  subdomain: string;
  theme: SiteTheme | null;
};

async function EditorLoader({
  params,
}: {
  params: PageProps<"/editor/[pageId]">["params"];
}) {
  const { pageId } = await params;
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("pages")
    .select(
      "id, slug, title, draft_data, site:sites(id, name, subdomain, theme)",
    )
    .eq("id", pageId)
    .maybeSingle();

  if (!data) {
    // No row = page missing or the user is not a member (RLS).
    notFound();
  }

  // supabase-js types to-one joins as arrays without generated DB types.
  const site = data.site as unknown as EditorSite;

  // Preview always uses the subdomain URL: auth cookies are scoped to the
  // root domain, so they are sent to subdomains but never custom domains.
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const protocol = root.includes("localhost") ? "http" : "https";
  const path = data.slug ? `/${data.slug}` : "/";
  const previewUrl = `${protocol}://${site.subdomain}.${root}${path}?preview=1`;

  return (
    <PageEditor
      page={{ id: data.id, slug: data.slug, title: data.title }}
      site={site}
      initialData={data.draft_data as Record<string, unknown>}
      previewUrl={previewUrl}
    />
  );
}
