"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  changePageSlug, createSitePage, deleteSitePage, duplicateSitePage, renameSitePage, reorderSitePages,
  setSiteHomePage, type PageResult,
} from "@/lib/site-pages";

/**
 * Page management for the editor's Pages panel. Queries use the
 * user-scoped client, so RLS limits them to the site's members and the
 * super admin. `openPageId` is the page open in the editor: the server
 * never rewrites its draft (the client applies the same change in memory
 * so autosave cannot overwrite it).
 */

function done(result: PageResult, siteId?: string): PageResult {
  if (result.status === "success" && siteId) revalidatePath(`/dashboard/sites/${siteId}`);
  return result;
}

const startSchema = z.discriminatedUnion("from", [
  z.object({ from: z.literal("blank") }),
  z.object({ from: z.literal("ai") }),
  z.object({ from: z.literal("copy"), pageId: z.uuid() }),
]);

export async function createEditorPage(siteId: string, title: string, slug: string, start: z.input<typeof startSchema>): Promise<PageResult> {
  const parsed = startSchema.safeParse(start);
  if (!parsed.success) return { status: "error", message: "Choose how to start the page." };
  const { supabase } = await requireUser();
  return done(await createSitePage(supabase, {
    siteId, title, slug, copyFromPageId: parsed.data.from === "copy" ? parsed.data.pageId : undefined,
  }), siteId);
}

export async function duplicateEditorPage(pageId: string): Promise<PageResult> {
  const { supabase } = await requireUser();
  return done(await duplicateSitePage(supabase, pageId));
}

export async function renameEditorPage(pageId: string, title: string, openPageId: string): Promise<PageResult> {
  const { supabase } = await requireUser();
  return done(await renameSitePage(supabase, pageId, title, { skipDraft: pageId === openPageId }));
}

export async function changeEditorPageSlug(pageId: string, slug: string, redirect: boolean, openPageId: string): Promise<PageResult> {
  if (typeof redirect !== "boolean" || !z.uuid().safeParse(openPageId).success) return { status: "error", message: "Invalid request." };
  const { supabase } = await requireUser();
  return done(await changePageSlug(supabase, pageId, slug, { redirect, skipDraftOf: openPageId }));
}

export async function setEditorHomePage(pageId: string): Promise<PageResult> {
  const { supabase } = await requireUser();
  return done(await setSiteHomePage(supabase, pageId));
}

export async function setPageHiddenFromMenus(pageId: string, hidden: boolean): Promise<PageResult> {
  const parsed = z.object({ pageId: z.uuid(), hidden: z.boolean() }).safeParse({ pageId, hidden });
  if (!parsed.success) return { status: "error", message: "Invalid page." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("pages").update({ hide_from_menu: parsed.data.hidden })
    .eq("id", parsed.data.pageId).select("id");
  if (error || !data?.length) return { status: "error", message: "Could not update the menu setting." };
  return { status: "success", message: parsed.data.hidden ? "Hidden from site menus." : "Shown in site menus." };
}

export async function deleteEditorPage(pageId: string): Promise<PageResult> {
  const { supabase } = await requireUser();
  return done(await deleteSitePage(supabase, pageId));
}

export async function reorderEditorPages(siteId: string, orderedIds: string[]): Promise<PageResult> {
  const { supabase } = await requireUser();
  return done(await reorderSitePages(supabase, siteId, orderedIds), siteId);
}
