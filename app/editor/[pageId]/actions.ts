"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/form-state";
import { sanitizePuckData } from "@/lib/richtext";

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

type PuckDataInput = z.infer<typeof puckDataSchema>;

function rootProps(data: PuckDataInput): { title?: string; description?: string } {
  const props = (data.root.props ?? {}) as Record<string, unknown>;
  return {
    title: typeof props.title === "string" ? props.title : undefined,
    description: typeof props.description === "string" ? props.description : undefined,
  };
}

/**
 * Loads the page (via RLS) and applies the update. Also syncs the page
 * title and SEO description from the Puck root fields into pages.title
 * and pages.seo, which generateMetadata reads on the public site.
 */
async function updatePage(
  pageId: string,
  rawData: unknown,
  publish: boolean,
): Promise<ActionState> {
  const parsedId = z.uuid().safeParse(pageId);
  const parsedData = puckDataSchema.safeParse(rawData);
  if (!parsedId.success || !parsedData.success) {
    return { status: "error", message: "Invalid page data." };
  }

  const { supabase } = await requireUser();

  const { data: page } = await supabase
    .from("pages")
    .select("id, title, seo")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (!page) {
    return { status: "error", message: "You do not have access to this page." };
  }

  const root = rootProps(parsedData.data);
  const seo = { ...(page.seo as Record<string, unknown>) };
  if (root.description !== undefined) seo.description = root.description;

  // Rich text props are client-authored HTML: sanitize before storing so
  // malicious markup never reaches site visitors or other editors.
  const cleanData = sanitizePuckData(parsedData.data);

  const update: Record<string, unknown> = {
    draft_data: cleanData,
    title: root.title || page.title,
    seo,
  };
  if (publish) {
    update.published_data = cleanData;
    update.published_at = new Date().toISOString();
  }

  const { error } = await supabase.from("pages").update(update).eq("id", parsedId.data);
  if (error) {
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

export async function publishPage(pageId: string, data: unknown): Promise<ActionState> {
  return updatePage(pageId, data, true);
}

const colorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .optional();

const themeSchema = z.object({
  style: z.enum(["classic", "modern"]).optional(),
  colors: z
    .object({
      primary: colorSchema,
      secondary: colorSchema,
      background: colorSchema,
      text: colorSchema,
    })
    .optional(),
  logoUrl: z.union([z.url(), z.literal("")]).optional(),
});

/**
 * Saves the site-wide theme to sites.theme. RLS lets account members
 * update only name and theme on their own sites.
 */
export async function saveSiteTheme(siteId: string, rawTheme: unknown): Promise<ActionState> {
  const parsedId = z.uuid().safeParse(siteId);
  const parsedTheme = themeSchema.safeParse(rawTheme);
  if (!parsedId.success || !parsedTheme.success) {
    return { status: "error", message: "Invalid theme." };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("sites")
    .update({ theme: parsedTheme.data })
    .eq("id", parsedId.data)
    .select("id");

  if (error || !data?.length) {
    return { status: "error", message: "Could not save the theme." };
  }
  return { status: "success", message: "Theme saved." };
}
