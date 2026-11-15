"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizePuckData } from "@/lib/richtext";
import { puckConfig } from "@/lib/puck/config";
import {
  SECTION_CATEGORIES,
  type SectionDesign,
} from "@/lib/sections/catalog";
import type { ActionState } from "@/lib/form-state";

/**
 * Server Actions for the section design library (section_designs table).
 * Reading is open to any signed-in user (RLS enforces it too); writing
 * is super admin only, checked here before using the admin client.
 */

type DesignRow = {
  id: string;
  name: string;
  category: string;
  block_type: string;
  props: Record<string, unknown>;
  thumbnail_url: string | null;
};

/** Saved designs from the database, mapped to the catalog shape. */
export async function listSavedDesigns(): Promise<SectionDesign[]> {
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("section_designs")
    .select("id, name, category, block_type, props, thumbnail_url")
    .eq("is_global", true)
    .order("created_at", { ascending: false });

  return ((data ?? []) as DesignRow[])
    .filter(
      (row) =>
        row.block_type in puckConfig.components &&
        (SECTION_CATEGORIES as readonly string[]).includes(row.category),
    )
    .map((row) => ({
      id: `saved-${row.id}`,
      blockType: row.block_type,
      category: row.category as SectionDesign["category"],
      name: row.name,
      thumbnail: row.thumbnail_url,
      props: row.props ?? {},
      styles: ["classic", "modern"],
    }));
}

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

const saveDesignSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(SECTION_CATEGORIES),
  blockType: z.string().min(1).max(60),
  props: z.record(z.string(), z.unknown()),
  /** PNG thumbnail as a data URL, captured client-side (≤ ~1.5MB). */
  thumbnail: z
    .string()
    .startsWith(PNG_DATA_URL_PREFIX)
    .max(2_000_000)
    .optional(),
});

async function isSuperAdmin(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(profile?.is_super_admin);
}

/**
 * "Save as design" (super admin only): stores a section's props and its
 * screenshot thumbnail so the design shows up in everyone's gallery.
 */
export async function saveSectionDesign(input: unknown): Promise<ActionState> {
  const parsed = saveDesignSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid design data." };
  }

  const { supabase, user } = await requireUser();
  if (!(await isSuperAdmin(supabase, user.id))) {
    return { status: "error", message: "Only the agency can save designs." };
  }

  const { name, category, blockType, props, thumbnail } = parsed.data;

  if (!(blockType in puckConfig.components)) {
    return { status: "error", message: "Unknown section type." };
  }

  // Props are client-authored: sanitize rich text before storing, the
  // same way page saves do, so the gallery can never serve markup that
  // was not cleaned.
  const sanitized = sanitizePuckData({
    content: [{ type: blockType, props: { ...props } }],
  });
  const cleanProps: Record<string, unknown> = { ...sanitized.content[0].props };
  delete cleanProps.id; // Puck instance id — never part of a design.

  const admin = createAdminClient();

  let thumbnailUrl: string | null = null;
  if (thumbnail) {
    const bytes = Buffer.from(
      thumbnail.slice(PNG_DATA_URL_PREFIX.length),
      "base64",
    );
    const path = `section-designs/${randomUUID()}.png`;
    const { error: uploadError } = await admin.storage
      .from("site-assets")
      .upload(path, bytes, { contentType: "image/png", cacheControl: "31536000" });
    if (!uploadError) {
      thumbnailUrl = admin.storage.from("site-assets").getPublicUrl(path).data
        .publicUrl;
    }
  }

  const { error } = await admin.from("section_designs").insert({
    name,
    category,
    block_type: blockType,
    props: cleanProps,
    thumbnail_url: thumbnailUrl,
    created_by: user.id,
    is_global: true,
  });

  if (error) {
    return { status: "error", message: "Could not save the design." };
  }
  return { status: "success", message: `Design "${name}" saved.` };
}
