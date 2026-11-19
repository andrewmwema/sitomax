"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/form-state";
import {
  changePageSlug, createSitePage, deleteSitePage, renameSitePage, reorderSitePages, setSiteHomePage, type PageResult,
} from "@/lib/site-pages";

/**
 * Pages manager Server Actions. All queries use the user-scoped client:
 * RLS only lets members of the site's account (or the super admin)
 * read/insert/update/delete pages.
 */

function revalidateSite(siteId: string) {
  revalidatePath(`/dashboard/sites/${siteId}`);
  revalidatePath("/dashboard");
}

function state(result: PageResult): ActionState {
  return { status: result.status, message: result.message };
}

async function siteOf(pageId: string) {
  const { supabase } = await requireUser();
  if (!z.uuid().safeParse(pageId).success) return { supabase, siteId: null };
  const { data } = await supabase.from("pages").select("site_id").eq("id", pageId).maybeSingle();
  return { supabase, siteId: (data?.site_id as string | undefined) ?? null };
}

export async function createPage(siteId: string, title: string): Promise<ActionState> {
  const { supabase } = await requireUser();
  const result = await createSitePage(supabase, { siteId, title });
  if (result.status === "success") revalidateSite(siteId);
  return state(result);
}

export async function renamePage(pageId: string, title: string, slug: string): Promise<ActionState> {
  const { supabase, siteId } = await siteOf(pageId);
  if (!siteId) return { status: "error", message: "You do not have access to this page." };
  const renamed = await renameSitePage(supabase, pageId, title);
  if (renamed.status === "error") return state(renamed);
  const { data: page } = await supabase.from("pages").select("slug").eq("id", pageId).maybeSingle();
  const result = page?.slug === "" ? renamed : await changePageSlug(supabase, pageId, slug, { redirect: false });
  revalidateSite(siteId);
  return state(result.status === "success" ? { ...result, message: "Page updated." } : result);
}

export async function deletePage(pageId: string): Promise<ActionState> {
  const { supabase, siteId } = await siteOf(pageId);
  if (!siteId) return { status: "error", message: "You do not have access to this page." };
  const result = await deleteSitePage(supabase, pageId);
  if (result.status === "success") revalidateSite(siteId);
  return state(result);
}

export async function movePage(pageId: string, direction: "up" | "down"): Promise<ActionState> {
  const { supabase, siteId } = await siteOf(pageId);
  if (!siteId) return { status: "error", message: "You do not have access to this page." };
  const { data: pages } = await supabase.from("pages").select("id")
    .eq("site_id", siteId).order("sort_order", { ascending: true }).order("id", { ascending: true });
  const ordered = (pages ?? []).map((page) => page.id as string);
  const index = ordered.indexOf(pageId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= ordered.length) return { status: "idle" };
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  const result = await reorderSitePages(supabase, siteId, ordered);
  if (result.status === "success") revalidateSite(siteId);
  return state(result.status === "success" ? { ...result, message: "Order updated." } : result);
}

export async function setHomePage(pageId: string): Promise<ActionState> {
  const { supabase, siteId } = await siteOf(pageId);
  if (!siteId) return { status: "error", message: "You do not have access to this page." };
  const result = await setSiteHomePage(supabase, pageId);
  if (result.status === "success") revalidateSite(siteId);
  return state(result);
}
