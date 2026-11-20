"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import type { ActionState } from "@/lib/form-state";
import { mediaUrlSchema } from "@/lib/media";

const settingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Agency name is required.")
    .max(100, "Name is too long."),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a valid color."),
  support_email: z.email("Enter a valid email.").or(z.literal("")),
});

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

/**
 * Updates agency branding (super admin only). The logo is uploaded to the
 * public "branding" storage bucket; storage RLS limits writes to the
 * super admin.
 */
export async function updateAgencySettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireSuperAdmin();

  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    primary_color: formData.get("primary_color"),
    support_email: formData.get("support_email") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  let logoUrl: string | undefined;
  if (formData.has("logo_url")) {
    const selected = mediaUrlSchema.or(z.literal("")).safeParse(formData.get("logo_url"));
    if (!selected.success) return { status: "error", message: "Use a valid HTTPS logo URL or local path." };
    logoUrl = selected.data;
  }
  const logo = formData.get("logo");

  if (logo instanceof File && logo.size > 0) {
    const extension = ALLOWED_LOGO_TYPES[logo.type];
    if (!extension) {
      return {
        status: "error",
        message: "Logo must be a PNG, JPEG, SVG or WebP image.",
      };
    }
    if (logo.size > MAX_LOGO_BYTES) {
      return { status: "error", message: "Logo must be 2 MB or smaller." };
    }

    const path = `logo-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("branding")
      .upload(path, logo, { contentType: logo.type, upsert: true });

    if (uploadError) {
      return { status: "error", message: "Could not upload the logo." };
    }

    logoUrl = supabase.storage.from("branding").getPublicUrl(path)
      .data.publicUrl;
  }

  const { error } = await supabase
    .from("agency_settings")
    .update({
      name: parsed.data.name,
      primary_color: parsed.data.primary_color,
      support_email: parsed.data.support_email || null,
      show_lead_email_branding: formData.get("show_lead_email_branding") === "on",
      ...(logoUrl !== undefined ? { logo_url: logoUrl || null } : {}),
    })
    .eq("id", 1);

  if (error) {
    return { status: "error", message: "Could not save the settings." };
  }

  // Branding feeds the whole app (login, sidebar, theme color).
  revalidatePath("/", "layout");
  return { status: "success", message: "Settings saved." };
}
