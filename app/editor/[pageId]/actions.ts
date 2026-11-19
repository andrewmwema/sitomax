"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/form-state";
import { sanitizePuckData } from "@/lib/richtext";
import { themeSchema } from "@/lib/theme/schema";
import { rootSeoSchema } from "@/lib/seo";
import { menuLabelSchema } from "@/lib/page-navigation";
import { headerSchema, headerPageSchema, headerMigrationMissing } from "@/lib/header";
import {
  EMBED_MAX_LENGTH,
  collectEmbeds,
  hasUnauthorizedEmbeds,
} from "@/lib/layout/embed";

/**
 * Editor Server Actions. All queries run with the user-scoped client, so
 * Postgres RLS guarantees only members of the site's account (or the
 * super admin) can touch the page or site.
 */

const puckDataSchema = z.looseObject({
  content: z.array(z.looseObject({ type: z.string() })),
  root: z.looseObject({
    props: z.looseObject({}).optional(),
  }),
});

/**
 * Loads the page (via RLS) and applies the update. Also syncs the page
 * title and SEO from the Puck root fields into pages.title/pages.seo on
 * publish only; autosaving a draft must not change the live metadata.
 */
async function updatePage(
  pageId: string,
  rawData: unknown,
  publish: boolean,
  ai?: { snapshot: boolean; theme?: z.infer<typeof themeSchema>; expectedTheme?: z.infer<typeof themeSchema> },
): Promise<ActionState> {
  const parsedId = z.uuid().safeParse(pageId);
  const parsedData = puckDataSchema.safeParse(rawData);
  if (!parsedId.success || !parsedData.success) {
    return { status: "error", message: "Invalid page data." };
  }
  const parsedRoot = rootSeoSchema.safeParse(parsedData.data.root.props ?? {});
  if (!parsedRoot.success) return { status: "error", message: "Invalid page SEO settings." };
  if (!headerPageSchema.safeParse(parsedData.data.root.props ?? {}).success)
    return { status: "error", message: "Invalid page header settings." };
  const rawHeader = parsedData.data.root.props?.__editorHeader;
  const expectedHeader = parsedData.data.root.props?.__expectedHeader ?? null;
  const header = rawHeader === undefined ? undefined : headerSchema.safeParse(rawHeader);
  if (header && !header.success) return { status: "error", message: "Invalid header settings." };

  const { supabase, user } = await requireUser();

  const { data: page, error: loadError } = await supabase
    .from("pages")
    .select("id, title, seo, draft_data, published_data")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (loadError) {
    console.error("Unable to load page for saving", loadError);
    return { status: "error", message: "Could not load the page. Please try again." };
  }
  if (!page) {
    return { status: "error", message: "You do not have access to this page." };
  }

  const embeds = collectEmbeds(parsedData.data);
  if (embeds.length > 0) {
    const tooLong = embeds.some((embed) => {
      const code = (embed.props as Record<string, unknown> | undefined)?.code;
      return typeof code === "string" && code.length > EMBED_MAX_LENGTH;
    });
    if (tooLong) {
      return { status: "error", message: "Embed code is too long." };
    }
    // Embed code is agency-only (see lib/layout/embed.ts); the database
    // trigger guard_page_embeds enforces the same rule.
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (
      !profile?.is_super_admin &&
      hasUnauthorizedEmbeds(parsedData.data, [page.draft_data, page.published_data])
    ) {
      return { status: "error", message: "Only your agency can add or change embed code." };
    }
  }

  const root = parsedRoot.data;
  const seo = { ...(page.seo as Record<string, unknown>) };
  if (root.seoTitle !== undefined) seo.title = root.seoTitle;
  else if (root.title !== undefined) seo.title = root.title;
  if (root.description !== undefined) seo.description = root.description;
  if (root.socialImage !== undefined) seo.image = root.socialImage;
  if (root.indexing !== undefined) seo.noindex = root.indexing === "inherit" ? null : root.indexing === "noindex";

  // Rich text props are client-authored HTML: sanitize before storing so
  // malicious markup never reaches site visitors or other editors.
  const cleanData = sanitizePuckData(parsedData.data);
  if (cleanData.root.props) {
    delete cleanData.root.props.__editorTheme;
    delete cleanData.root.props.__editorHeader;
    delete cleanData.root.props.__expectedHeader;
  }

  if (header?.success) {
    const { error } = await supabase.rpc("save_page_with_header", {
      p_page_id: parsedId.data, p_data: cleanData, p_header: header.data,
      p_expected_header: expectedHeader,
      p_publish: publish, p_title: root.title || page.title, p_seo: seo,
      p_snapshot: ai?.snapshot ?? false, p_theme: ai?.theme ?? null,
      p_expected_theme: ai?.expectedTheme ?? null,
    });
    if (error) {
      console.error("Could not save page and global header", { code: error.code });
      return { status: "error", message: error.code === "40001"
        ? "The site header or theme changed in another editor. Reload before saving."
        : "Could not save the page and header. Check that the global header migration has been applied." };
    }
    return { status: "success", message: publish ? "Page and site header published." : "Draft saved." };
  }

  if (ai) {
    const { data: saved, error } = await supabase.rpc("save_editor_ai_draft", {
      p_page_id: parsedId.data, p_data: cleanData, p_theme: ai.theme ?? null,
      p_snapshot: ai.snapshot, p_expected_theme: ai.expectedTheme ?? null,
    });
    if (error || saved !== true) {
      console.error("Could not save AI draft", { code: error?.code });
      return { status: "error", message: error?.code === "40001"
        ? "The site theme changed in another editor. Reload before trying again."
        : "Could not save the AI draft. Check that the editor history migration has been applied." };
    }
    return { status: "success", message: "Draft saved." };
  }

  const update: Record<string, unknown> = {
    draft_data: cleanData,
  };
  if (publish) {
    update.title = root.title || page.title;
    update.seo = seo;
    update.published_data = cleanData;
    update.published_at = new Date().toISOString();
  }

  const { data: updated, error } = await supabase.from("pages").update(update).eq("id", parsedId.data).select("id");
  if (error || !updated?.length) {
    console.error("Unable to save page", error);
    return { status: "error", message: "Could not save the page. Please try again." };
  }

  return {
    status: "success",
    message: publish ? "Page published." : "Draft saved.",
  };
}

export async function savePageDraft(pageId: string, data: unknown): Promise<ActionState> {
  return updatePage(pageId, data, false);
}

export async function savePageMenuLabel(pageId: string, label: string, hidden?: boolean): Promise<ActionState> {
  const parsed = z.object({ pageId: z.uuid(), label: menuLabelSchema, hidden: z.boolean().optional() }).safeParse({ pageId, label, hidden });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid menu label." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("pages").update({
    nav_label: parsed.data.label, ...(parsed.data.hidden === undefined ? {} : { hide_from_menu: parsed.data.hidden }),
  }).eq("id", parsed.data.pageId).select("id");
  if (error || !data?.length) {
    console.error("Could not save page menu label", { code: error?.code });
    return { status: "error", message: "Could not save the menu label." };
  }
  return { status: "success", message: "Menu settings saved." };
}

export async function saveAiEdit(pageId: string, data: unknown, raw: unknown): Promise<ActionState> {
  const parsed = z.strictObject({ snapshot: z.boolean(), theme: themeSchema.optional(), expectedTheme: themeSchema.optional() }).safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Invalid theme or draft snapshot." };
  return updatePage(pageId, data, false, parsed.data);
}

export async function publishPage(pageId: string, data: unknown): Promise<ActionState> {
  return updatePage(pageId, data, true);
}

export async function listPageVersions(pageId: string): Promise<{ id: string; published_at: string; kind: "published" | "ai_edit" | "header_edit" | "header_migration" }[]> {
  const id = z.uuid().parse(pageId);
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("page_versions").select("id, published_at, kind")
    .eq("page_id", id).order("published_at", { ascending: false }).order("id", { ascending: false }).limit(20);
  if (error) throw new Error("Could not load published versions.", { cause: error });
  return data ?? [];
}

export async function restorePageVersion(pageId: string, versionId: string) {
  const parsed = z.object({ pageId: z.uuid(), versionId: z.uuid() }).safeParse({ pageId, versionId });
  if (!parsed.success) return { status: "error" as const, message: "Invalid page version." };
  const { supabase } = await requireUser();
  const loaded = await supabase.from("page_versions").select("data, theme, header")
    .eq("page_id", parsed.data.pageId).eq("id", parsed.data.versionId).maybeSingle();
  const headersReady = !headerMigrationMissing(loaded.error);
  if (!headersReady) console.warn("Global header migration is not applied; restoring legacy page history.");
  const { data: version, error } = headersReady ? loaded : await supabase.from("page_versions").select("data, theme")
    .eq("page_id", parsed.data.pageId).eq("id", parsed.data.versionId).maybeSingle();
  if (error || !version) {
    console.error("Unable to load page version", error);
    return { status: "error" as const, message: "This version is unavailable." };
  }
  if (!headersReady) {
    const theme = version.theme ? themeSchema.parse(version.theme) : undefined;
    let expectedTheme;
    if (theme) {
      const { data, error } = await supabase.from("pages").select("site:sites(theme, draft_theme)").eq("id", parsed.data.pageId).maybeSingle();
      if (error || !data) return { status: "error" as const, message: "Could not load the current site theme." };
      const site = z.object({ theme: z.unknown(), draft_theme: z.unknown() }).parse(data.site);
      expectedTheme = themeSchema.parse(site.draft_theme ?? site.theme ?? {});
    }
    const result = await updatePage(pageId, version.data, false, theme ? { theme, expectedTheme, snapshot: false } : undefined);
    return result.status === "success" ? {
      status: "success" as const, message: "Version restored to draft.", data: version.data, theme,
    } : result;
  }
  const { data: page, error: pageError } = await supabase.from("pages").select("site:sites(draft_header, theme, draft_theme, business)")
    .eq("id", parsed.data.pageId).maybeSingle();
  if (pageError || !page) {
    console.error("Unable to load site for header restoration", { code: pageError?.code });
    return { status: "error" as const, message: "Could not load the current site header." };
  }
  const site = z.object({ draft_header: z.unknown(), theme: z.unknown(), draft_theme: z.unknown(), business: z.unknown().optional() }).parse(page.site);
  const theme = version.theme ? themeSchema.parse(version.theme) : undefined;
  const previous = puckDataSchema.parse(version.data);
  const legacy = previous.content.some(item => item.type === "Navigation");
  const restoredHeader = headerSchema.parse(legacy ? site.draft_header ?? {} :
    ("header" in version ? version.header : undefined) ?? site.draft_header ?? {});
  const restoredProps: Record<string, unknown> = { ...previous.root.props,
    __editorHeader: restoredHeader, __expectedHeader: site.draft_header ?? null,
    ...(legacy ? { __legacyNavigation: true } : {}),
  };
  const data = { ...previous, root: { ...previous.root, props: restoredProps } };
  const result = await updatePage(pageId, data, false, { snapshot: false, ...(theme ? {
    theme, expectedTheme: themeSchema.parse(site.draft_theme ?? site.theme ?? {}),
  } : {}) });
  delete data.root.props.__expectedHeader;
  return result.status === "success"
    ? { status: "success" as const, message: "Version restored to draft. Publish to make it live.", data, theme, header: restoredHeader }
    : result;
}
/**
 * Saves a pending AI theme to draft_theme; other theme edits retain the
 * existing live-theme behavior. RLS scopes both to the member's sites.
 */
export async function saveSiteTheme(siteId: string, rawTheme: unknown): Promise<ActionState> {
  const parsedId = z.uuid().safeParse(siteId);
  const parsedTheme = themeSchema.safeParse(rawTheme);
  if (!parsedId.success || !parsedTheme.success) {
    return { status: "error", message: "Invalid theme." };
  }

  const { supabase } = await requireUser();
  const { data: site, error: siteError } = await supabase.from("sites").select("draft_theme")
    .eq("id", parsedId.data).maybeSingle();
  if (siteError || !site) return { status: "error", message: "Could not load the site theme." };
  if (site.draft_theme) {
    const { data, error } = await supabase.rpc("save_site_draft_theme", { p_site_id: parsedId.data, p_theme: parsedTheme.data });
    if (error || !data) return { status: "error", message: "Could not save the theme." };
    return { status: "success", message: "Theme saved." };
  }
  const { data, error } = await supabase.from("sites")
    .update({ theme: parsedTheme.data }).eq("id", parsedId.data).select("id");

  if (error || !data?.length) {
    return { status: "error", message: "Could not save the theme." };
  }
  return { status: "success", message: "Theme saved." };
}
