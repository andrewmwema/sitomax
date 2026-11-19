import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { pagePath, rewriteLegacyPageLinks } from "@/lib/links";

/**
 * Page management shared by the dashboard pages manager and the editor's
 * Pages panel. Every query uses the caller's user-scoped client, so RLS
 * decides who may create, change or delete pages (account members and
 * the super admin). There are no per-plan page limits.
 */

type Client = Awaited<ReturnType<typeof createClient>>;
export type PageResult =
  | { status: "success"; message: string; pageId?: string; slug?: string; rewrittenLinks?: number }
  | { status: "error"; message: string };

export { RESERVED_PAGE_SLUGS, pageTitleSchema, slugError, slugify, uniqueSlug } from "@/lib/page-slugs";
import { pageTitleSchema, slugError, uniqueSlug } from "@/lib/page-slugs";

type PageRow = { id: string; site_id: string; slug: string; title: string | null; sort_order: number | null; draft_data: unknown };

async function loadPage(supabase: Client, pageId: string) {
  if (!z.uuid().safeParse(pageId).success) return null;
  const { data } = await supabase.from("pages")
    .select("id, site_id, slug, title, sort_order, draft_data").eq("id", pageId).maybeSingle();
  return data as PageRow | null;
}

async function sitePages(supabase: Client, siteId: string) {
  const { data } = await supabase.from("pages").select("id, slug, sort_order")
    .eq("site_id", siteId).order("sort_order", { ascending: true }).order("id", { ascending: true });
  return data as { id: string; slug: string; sort_order: number | null }[] | null;
}

/** A page now owns this path, so a redirect from it would hide the page. */
async function clearShadowingRedirect(supabase: Client, siteId: string, slug: string) {
  await supabase.from("redirects").delete().eq("site_id", siteId).eq("from_path", pagePath(slug));
}

const createSchema = z.object({
  siteId: z.uuid(),
  title: pageTitleSchema,
  slug: z.string().trim().max(60).optional(),
  copyFromPageId: z.uuid().optional(),
});

export async function createSitePage(supabase: Client, input: z.input<typeof createSchema>): Promise<PageResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Enter a page name." };
  const { siteId, title, copyFromPageId } = parsed.data;
  const pages = await sitePages(supabase, siteId);
  if (!pages) return { status: "error", message: "You do not have access to this site." };
  const taken = pages.map(({ slug }) => slug);
  const hasHome = taken.includes("");
  const slug = !hasHome ? "" : parsed.data.slug ? parsed.data.slug : uniqueSlug(title, taken);
  if (slug) {
    const error = slugError(slug, taken);
    if (error) return { status: "error", message: error };
  }

  let draft: unknown = { content: [], root: { props: { title } } };
  if (copyFromPageId) {
    const source = await loadPage(supabase, copyFromPageId);
    if (!source || source.site_id !== siteId) return { status: "error", message: "The page to copy was not found." };
    draft = withTitle(source.draft_data, title);
  }

  const { data, error } = await supabase.from("pages").insert({
    site_id: siteId, slug, title, draft_data: draft, seo: {},
    sort_order: Math.max(-1, ...pages.map(({ sort_order }) => sort_order ?? 0)) + 1,
  }).select("id").single();
  if (error || !data) {
    return { status: "error", message: error?.code === "23505" ? "Another page already uses this slug." : "Could not create the page." };
  }
  if (slug) await clearShadowingRedirect(supabase, siteId, slug);
  return { status: "success", message: `“${title}” created.`, pageId: data.id, slug };
}

function withTitle(data: unknown, title: string): unknown {
  const copy = structuredClone(data && typeof data === "object" ? data : { content: [] }) as { root?: { props?: Record<string, unknown> } };
  copy.root = { ...copy.root, props: { ...copy.root?.props, title } };
  return copy;
}

export async function duplicateSitePage(supabase: Client, pageId: string): Promise<PageResult> {
  const page = await loadPage(supabase, pageId);
  if (!page) return { status: "error", message: "You do not have access to this page." };
  const title = `${page.title || "Page"} (copy)`.slice(0, 80);
  const pages = await sitePages(supabase, page.site_id) ?? [];
  const result = await createSitePage(supabase, {
    siteId: page.site_id, title, copyFromPageId: page.id,
    slug: uniqueSlug(`${page.slug || "home"}-copy`, pages.map(({ slug }) => slug)),
  });
  if (result.status === "error") return result;
  // Place the copy right after its source.
  const ordered = pages.map(({ id }) => id);
  ordered.splice(ordered.indexOf(page.id) + 1, 0, result.pageId!);
  await reorderSitePages(supabase, page.site_id, ordered);
  return { ...result, message: `Duplicated as “${title}”.` };
}

/**
 * Publishing copies the draft root title into pages.title, so the draft
 * root is renamed too (unless the editor has this page open and renames
 * its in-memory draft itself).
 */
export async function renameSitePage(
  supabase: Client, pageId: string, title: string, options: { skipDraft?: boolean } = {},
): Promise<PageResult> {
  const parsed = pageTitleSchema.safeParse(title);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Enter a page name." };
  const page = await loadPage(supabase, pageId);
  if (!page) return { status: "error", message: "You do not have access to this page." };
  const { error } = await supabase.from("pages").update({
    title: parsed.data, ...(options.skipDraft ? {} : { draft_data: withTitle(page.draft_data, parsed.data) }),
  }).eq("id", page.id);
  return error ? { status: "error", message: "Could not rename the page." } : { status: "success", message: "Page renamed." };
}

/**
 * Changes a page slug. Page-id links follow automatically; legacy "/old"
 * string links in other pages' drafts are rewritten, and an optional 301
 * keeps published links and bookmarks working. `skipDraftOf` is the page
 * open in the editor, whose draft the client rewrites itself.
 */
export async function changePageSlug(
  supabase: Client,
  pageId: string,
  nextSlug: string,
  options: { redirect: boolean; skipDraftOf?: string },
): Promise<PageResult> {
  const page = await loadPage(supabase, pageId);
  if (!page) return { status: "error", message: "You do not have access to this page." };
  if (page.slug === "") return { status: "error", message: "The homepage has no slug. Set another page as homepage first." };
  const slug = nextSlug.trim();
  if (slug === page.slug) return { status: "success", message: "Slug unchanged.", slug };
  const pages = await sitePages(supabase, page.site_id) ?? [];
  const error = slugError(slug, pages.filter(({ id }) => id !== page.id).map(({ slug: other }) => other));
  if (error) return { status: "error", message: error };

  const { error: updateError } = await supabase.from("pages").update({ slug }).eq("id", page.id);
  if (updateError) {
    return { status: "error", message: updateError.code === "23505" ? "Another page already uses this slug." : "Could not change the slug." };
  }

  const oldPath = pagePath(page.slug);
  const newPath = pagePath(slug);
  await clearShadowingRedirect(supabase, page.site_id, slug);
  // Avoid redirect chains: anything that pointed at the old path now goes to the new one.
  await supabase.from("redirects").update({ to_path: newPath }).eq("site_id", page.site_id).eq("to_path", oldPath);
  if (options.redirect) {
    const { error: redirectError } = await supabase.from("redirects")
      .upsert({ site_id: page.site_id, from_path: oldPath, to_path: newPath }, { onConflict: "site_id,from_path" });
    if (redirectError) {
      return { status: "success", message: "Slug changed, but the redirect from the old address could not be saved.", slug };
    }
  }

  const rewrittenLinks = await rewriteSiteDrafts(supabase, page.site_id, page.slug, slug, options.skipDraftOf);
  return { status: "success", message: options.redirect ? `Slug changed. ${oldPath} now redirects to ${newPath}.` : "Slug changed.", slug, rewrittenLinks };
}

async function rewriteSiteDrafts(supabase: Client, siteId: string, oldSlug: string, newSlug: string, skip?: string) {
  const { data } = await supabase.from("pages").select("id, draft_data").eq("site_id", siteId);
  let total = 0;
  for (const row of (data ?? []) as { id: string; draft_data: unknown }[]) {
    if (row.id === skip) continue;
    const { data: draft, changed } = rewriteLegacyPageLinks(row.draft_data, oldSlug, newSlug);
    if (!changed) continue;
    const { error } = await supabase.from("pages").update({ draft_data: draft }).eq("id", row.id);
    if (!error) total += changed;
  }
  return total;
}

export async function deleteSitePage(supabase: Client, pageId: string): Promise<PageResult> {
  const page = await loadPage(supabase, pageId);
  if (!page) return { status: "error", message: "You do not have access to this page." };
  if (page.slug === "") return { status: "error", message: "The homepage cannot be deleted. Set another page as homepage first." };
  const { error } = await supabase.from("pages").delete().eq("id", page.id);
  return error ? { status: "error", message: "Could not delete the page." } : { status: "success", message: `“${page.title || "Page"}” deleted.` };
}

/** Saves a full page order; it drives header and footer menus. */
export async function reorderSitePages(supabase: Client, siteId: string, orderedIds: string[]): Promise<PageResult> {
  if (!z.uuid().safeParse(siteId).success || !z.array(z.uuid()).max(500).safeParse(orderedIds).success) {
    return { status: "error", message: "Invalid page order." };
  }
  const pages = await sitePages(supabase, siteId);
  if (!pages) return { status: "error", message: "You do not have access to this site." };
  const ids = new Set(pages.map(({ id }) => id));
  if (orderedIds.length !== ids.size || new Set(orderedIds).size !== ids.size || orderedIds.some((id) => !ids.has(id))) {
    return { status: "error", message: "The page list changed. Reload and try again." };
  }
  for (const [index, id] of orderedIds.entries()) {
    if (pages.find((page) => page.id === id)?.sort_order === index) continue;
    const { error } = await supabase.from("pages").update({ sort_order: index }).eq("id", id);
    if (error) return { status: "error", message: "Could not reorder pages." };
  }
  return { status: "success", message: "Page order saved." };
}

/** Swaps slugs with the current homepage without breaking unique(site_id, slug). */
export async function setSiteHomePage(supabase: Client, pageId: string): Promise<PageResult> {
  const page = await loadPage(supabase, pageId);
  if (!page) return { status: "error", message: "You do not have access to this page." };
  if (page.slug === "") return { status: "success", message: "This page is already the homepage.", slug: "" };
  const { data: currentHome } = await supabase.from("pages").select("id")
    .eq("site_id", page.site_id).eq("slug", "").maybeSingle();
  const previousSlug = page.slug;
  const failed = { status: "error", message: "Could not set the homepage." } as const;

  if ((await supabase.from("pages").update({ slug: `tmp-${crypto.randomUUID()}` }).eq("id", page.id)).error) return failed;
  if (currentHome) {
    const { error } = await supabase.from("pages").update({ slug: previousSlug }).eq("id", currentHome.id);
    if (error) {
      await supabase.from("pages").update({ slug: previousSlug }).eq("id", page.id);
      return failed;
    }
  }
  if ((await supabase.from("pages").update({ slug: "" }).eq("id", page.id)).error) return failed;
  return { status: "success", message: `“${page.title || "Page"}” is now the homepage.`, slug: "" };
}
