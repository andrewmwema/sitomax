import "server-only";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { businessSchema } from "@/lib/business";
import { isCuratedFont, type CuratedFont } from "@/lib/theme/fonts";
import type { SiteTheme } from "@/lib/theme/presets";
import type { TemplateData } from "@/templates/shared";

const fontSchema = z.string().refine(isCuratedFont).transform((font) => font as CuratedFont);
const themeSchema: z.ZodType<SiteTheme> = z.object({
  style: z.enum(["classic", "modern"]).optional(),
  headingFont: fontSchema.optional(),
  bodyFont: fontSchema.optional(),
  radius: z.number().finite().optional(),
  buttonStyle: z.enum(["rounded", "square", "pill"]).optional(),
  spacing: z.enum(["compact", "comfortable", "spacious"]).optional(),
  colors: z.object({
    primary: z.string().optional(),
    secondary: z.string().optional(),
    accent: z.string().optional(),
    background: z.string().optional(),
    text: z.string().optional(),
  }).optional(),
  logoUrl: z.string().optional(),
  logoAlt: z.string().optional(),
  faviconUrl: z.string().optional(),
});

export const pageDataSchema = z.object({
  root: z.object({ props: z.record(z.string(), z.unknown()) }).passthrough(),
  content: z.array(z.object({
    type: z.string().min(1),
    props: z.record(z.string(), z.unknown()),
  }).passthrough()),
}).passthrough().transform((data) => data as TemplateData);

const templateSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,49}$/),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(300),
  best_for: z.array(z.string().trim().min(1).max(60)).max(12),
  preview_image: z.string().url(),
  theme: themeSchema,
  business: businessSchema,
  pages: z.array(z.object({
    title: z.string().trim().min(1).max(100),
    slug: z.string().max(200),
    nav_label: z.string().trim().min(1).max(40),
    data: pageDataSchema,
  })).min(1).max(12).refine((pages) => pages[0]?.slug === "" &&
    new Set(pages.map((page) => page.slug)).size === pages.length, "Template pages must have unique slugs and a home page."),
});

export type PremiumTemplate = z.infer<typeof templateSchema>;
export type TemplateAccount = { id: string; name: string };

export function parsePremiumTemplate(value: unknown): PremiumTemplate {
  return templateSchema.parse(value);
}

export async function getPremiumTemplate(id: string): Promise<PremiumTemplate | null> {
  const parsedId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,49}$/).safeParse(id);
  if (!parsedId.success) return null;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("site_templates")
    .select("id, name, description, best_for, preview_image, theme, business, pages")
    .eq("id", parsedId.data)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("Could not load this SitoMax Design.", { cause: error });
  return data ? parsePremiumTemplate(data) : null;
}

export async function getPremiumTemplateGalleryOptions(): Promise<{
  isSuperAdmin: boolean;
  accounts: TemplateAccount[];
  templates: PremiumTemplate[];
}> {
  const { supabase, user } = await requireUser();
  const [{ data: profile, error: profileError }, { data: templateRows, error: templateError }] = await Promise.all([
    supabase.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle(),
    supabase.from("site_templates")
      .select("id, name, description, best_for, preview_image, theme, business, pages")
      .eq("is_active", true)
      .order("name"),
  ]);
  if (profileError) throw new Error("Could not verify template gallery access.", { cause: profileError });
  if (templateError) throw new Error("Could not load SitoMax Designs.", { cause: templateError });

  const isSuperAdmin = profile?.is_super_admin === true;
  let accountIds: string[] | null = null;
  if (!isSuperAdmin) {
    const { data: memberships, error } = await supabase.from("account_members")
      .select("account_id")
      .eq("user_id", user.id)
      .eq("role", "owner");
    if (error) throw new Error("Could not load your site-creation permissions.", { cause: error });
    accountIds = (memberships ?? []).map(({ account_id }) => account_id);
  }

  let accounts: TemplateAccount[] = [];
  if (isSuperAdmin || accountIds?.length) {
    let query = supabase.from("accounts").select("id, name").eq("is_internal", false).order("name");
    if (accountIds) query = query.in("id", accountIds);
    const { data, error } = await query;
    if (error) throw new Error("Could not load accounts for template creation.", { cause: error });
    accounts = data ?? [];
  }

  return {
    isSuperAdmin,
    accounts,
    templates: (templateRows ?? []).map(parsePremiumTemplate),
  };
}
