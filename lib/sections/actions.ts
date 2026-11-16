"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { sanitizePuckData } from "@/lib/richtext";
import { puckConfig } from "@/lib/puck/config";
import {
  SECTION_CATEGORIES,
  sectionCategory,
  type SectionDesign,
} from "@/lib/sections/catalog";
import type { ActionState } from "@/lib/form-state";

/**
 * Server Actions for the section design library (section_designs table).
 * RLS limits reads and writes to the creator's private designs or the
 * shared library. Only the agency may change global visibility.
 */

type DesignRow = {
  id: string;
  name: string;
  category: string;
  block_type: string;
  props: Record<string, unknown>;
  thumbnail_url: string | null;
  is_global: boolean;
  created_by: string | null;
};

/** Saved designs from the database, mapped to the catalog shape. */
export async function listSavedDesigns(): Promise<SectionDesign[]> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("section_designs")
    .select("id, name, category, block_type, props, thumbnail_url, is_global, created_by")
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load saved section designs", { cause: error });

  return ((data ?? []) as DesignRow[])
    .filter(
      (row) =>
        row.block_type in puckConfig.components &&
        sectionCategory(row.category) !== null,
    )
    .map((row) => ({
      id: `saved-${row.id}`,
      blockType: row.block_type,
      category: sectionCategory(row.category)!,
      name: row.name,
      thumbnail: row.thumbnail_url,
      props: row.props ?? {},
      styles: ["classic", "modern"],
      saved: { id: row.id, isGlobal: row.is_global, isOwner: row.created_by === user.id },
    }));
}

const saveDesignSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(SECTION_CATEGORIES),
  blockType: z.string().min(1).max(60),
  props: z.record(z.string(), z.unknown()),
  isGlobal: z.boolean().default(false),
});

async function isSuperAdmin(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Unable to check agency permissions", { cause: error });
  return Boolean(profile?.is_super_admin);
}

/**
 * Save a private section design, or share globally with agency permission.
 */
export async function saveSectionDesign(input: unknown): Promise<ActionState> {
  const parsed = saveDesignSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid design data." };
  }

  const { supabase, user } = await requireUser();
  if (parsed.data.isGlobal && !(await isSuperAdmin(supabase, user.id))) {
    return { status: "error", message: "Only the agency can share designs globally." };
  }

  const { name, category, blockType, props, isGlobal } = parsed.data;

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

  const { error } = await supabase.from("section_designs").insert({
    name,
    category,
    block_type: blockType,
    props: cleanProps,
    created_by: user.id,
    is_global: isGlobal,
  });

  if (error) {
    console.error("Unable to save section design", error);
    return { status: "error", message: "Could not save the design." };
  }

  return { status: "success", message: `Design "${name}" saved.` };
}

export async function setDesignGlobal(input: unknown): Promise<ActionState> {
  const parsed = z.object({ id: z.uuid(), isGlobal: z.boolean() }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Invalid design data." };
  const { supabase, user } = await requireUser();
  if (!(await isSuperAdmin(supabase, user.id))) {
    return { status: "error", message: "Only the agency can share designs globally." };
  }
  const { data, error } = await supabase.from("section_designs")
    .update({ is_global: parsed.data.isGlobal }).eq("id", parsed.data.id).select("id").single();
  if (error || !data) {
    console.error("Unable to update design visibility", error);
    return { status: "error", message: "Could not update design visibility." };
  }
  return { status: "success", message: "Design visibility updated." };
}
