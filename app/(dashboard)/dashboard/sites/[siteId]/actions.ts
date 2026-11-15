"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/form-state";

/**
 * Pages manager Server Actions. All queries use the user-scoped client:
 * RLS only lets members of the site's account (or the super admin)
 * read/insert/update/delete pages.
 */

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function revalidateSite(siteId: string) {
  revalidatePath(`/dashboard/sites/${siteId}`);
  revalidatePath("/dashboard");
}

export async function createPage(siteId: string, title: string): Promise<ActionState> {
  const parsed = z
    .object({ siteId: z.uuid(), title: z.string().trim().min(1).max(80) })
    .safeParse({ siteId, title });
  if (!parsed.success) {
    return { status: "error", message: "Enter a page title." };
  }

  const { supabase } = await requireUser();

  const { data: pages } = await supabase
    .from("pages")
    .select("slug, sort_order")
    .eq("site_id", parsed.data.siteId);

  if (!pages) {
    return { status: "error", message: "You do not have access to this site." };
  }

  const existingSlugs = new Set(pages.map((p) => p.slug));
  const base = slugify(parsed.data.title) || "page";
  let slug = base;
  for (let i = 2; existingSlugs.has(slug); i++) slug = `${base}-${i}`;

  const sortOrder = Math.max(0, ...pages.map((p) => p.sort_order ?? 0)) + 1;

  const { error } = await supabase.from("pages").insert({
    site_id: parsed.data.siteId,
    slug: existingSlugs.has("") ? slug : "",
    title: parsed.data.title,
    draft_data: { content: [], root: { props: { title: parsed.data.title } } },
    seo: {},
    sort_order: sortOrder,
  });

  if (error) {
    return { status: "error", message: "Could not create the page." };
  }
  revalidateSite(parsed.data.siteId);
  return { status: "success", message: "Page created." };
}

export async function renamePage(
  pageId: string,
  title: string,
  slug: string,
): Promise<ActionState> {
  const parsed = z
    .object({
      pageId: z.uuid(),
      title: z.string().trim().min(1).max(80),
      slug: z.string().trim().max(60),
    })
    .safeParse({ pageId, title, slug });
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid title and slug." };
  }

  const { supabase } = await requireUser();
  const { data: page } = await supabase
    .from("pages")
    .select("id, site_id, slug")
    .eq("id", parsed.data.pageId)
    .maybeSingle();
  if (!page) {
    return { status: "error", message: "You do not have access to this page." };
  }

  const isHome = page.slug === "";
  const nextSlug = isHome ? "" : parsed.data.slug;
  if (!isHome && !SLUG_REGEX.test(nextSlug)) {
    return {
      status: "error",
      message: "Slugs can only contain lowercase letters, numbers and dashes.",
    };
  }

  const { error } = await supabase
    .from("pages")
    .update({ title: parsed.data.title, slug: nextSlug })
    .eq("id", parsed.data.pageId);

  if (error) {
    return { status: "error", message: "That slug is already in use." };
  }
  revalidateSite(page.site_id);
  return { status: "success", message: "Page updated." };
}

export async function deletePage(pageId: string): Promise<ActionState> {
  const parsed = z.uuid().safeParse(pageId);
  if (!parsed.success) {
    return { status: "error", message: "Invalid page." };
  }

  const { supabase } = await requireUser();
  const { data: page } = await supabase
    .from("pages")
    .select("id, site_id, slug")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!page) {
    return { status: "error", message: "You do not have access to this page." };
  }
  if (page.slug === "") {
    return {
      status: "error",
      message: "The home page cannot be deleted. Set another page as home first.",
    };
  }

  const { error } = await supabase.from("pages").delete().eq("id", parsed.data);
  if (error) {
    return { status: "error", message: "Could not delete the page." };
  }
  revalidateSite(page.site_id);
  return { status: "success", message: "Page deleted." };
}

export async function movePage(
  pageId: string,
  direction: "up" | "down",
): Promise<ActionState> {
  const parsed = z.uuid().safeParse(pageId);
  if (!parsed.success) {
    return { status: "error", message: "Invalid page." };
  }

  const { supabase } = await requireUser();
  const { data: page } = await supabase
    .from("pages")
    .select("id, site_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!page) {
    return { status: "error", message: "You do not have access to this page." };
  }

  // Normalize the whole list, then swap with the neighbor. Keeps sort_order
  // stable even if older rows share the same value.
  const { data: pages } = await supabase
    .from("pages")
    .select("id")
    .eq("site_id", page.site_id)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  const ordered = (pages ?? []).map((p) => p.id);
  const index = ordered.indexOf(page.id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= ordered.length) {
    return { status: "idle" };
  }
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  for (let i = 0; i < ordered.length; i++) {
    const { error } = await supabase
      .from("pages")
      .update({ sort_order: i })
      .eq("id", ordered[i]);
    if (error) {
      return { status: "error", message: "Could not reorder pages." };
    }
  }

  revalidateSite(page.site_id);
  return { status: "success", message: "Order updated." };
}

export async function setHomePage(pageId: string): Promise<ActionState> {
  const parsed = z.uuid().safeParse(pageId);
  if (!parsed.success) {
    return { status: "error", message: "Invalid page." };
  }

  const { supabase } = await requireUser();
  const { data: page } = await supabase
    .from("pages")
    .select("id, site_id, slug, title")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!page) {
    return { status: "error", message: "You do not have access to this page." };
  }
  if (page.slug === "") {
    return { status: "idle" };
  }

  const { data: currentHome } = await supabase
    .from("pages")
    .select("id")
    .eq("site_id", page.site_id)
    .eq("slug", "")
    .maybeSingle();

  // Swap slugs without ever violating the (site_id, slug) unique constraint.
  const temporarySlug = `tmp-${crypto.randomUUID()}`;
  const newHomeOldSlug = page.slug;

  const { error: step1 } = await supabase
    .from("pages")
    .update({ slug: temporarySlug })
    .eq("id", page.id);
  if (step1) {
    return { status: "error", message: "Could not set the home page." };
  }

  if (currentHome) {
    const { error: step2 } = await supabase
      .from("pages")
      .update({ slug: newHomeOldSlug })
      .eq("id", currentHome.id);
    if (step2) {
      // Roll the first update back so the site keeps a home page.
      await supabase.from("pages").update({ slug: newHomeOldSlug }).eq("id", page.id);
      return { status: "error", message: "Could not set the home page." };
    }
  }

  const { error: step3 } = await supabase
    .from("pages")
    .update({ slug: "" })
    .eq("id", page.id);
  if (step3) {
    return { status: "error", message: "Could not set the home page." };
  }

  revalidateSite(page.site_id);
  return { status: "success", message: `“${page.title ?? "Page"}” is now the home page.` };
}
