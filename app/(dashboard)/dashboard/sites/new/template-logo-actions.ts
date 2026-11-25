"use server";

import { z } from "zod";
import { mediaAccess } from "@/lib/media-server";
import { defaultHeader, headerSchema } from "@/lib/header";
import { themeSchema } from "@/lib/theme/schema";
import { checkpointTemplateLogo } from "@/lib/ai/usage";
import { AiUserError } from "@/lib/ai/errors";

const logoInput = z.strictObject({
  siteId: z.uuid(), generationId: z.uuid(), path: z.string().max(255), alt: z.string().trim().max(500),
});

export async function applyTemplateLogo(raw: unknown) {
  const parsed = logoInput.safeParse(raw);
  if (!parsed.success) return { status: "error" as const, message: "Invalid logo details. Choose the logo in the editor." };
  const { siteId, generationId, path, alt } = parsed.data;
  const prefix = `${siteId}/`;
  if (!path.startsWith(prefix) || !/^[A-Za-z0-9_-]+\.(jpg|png|gif|webp|avif)$/.test(path.slice(prefix.length))) {
    return { status: "error" as const, message: "Invalid site logo. Choose the logo in the editor." };
  }
  try {
    const { supabase } = await mediaAccess({ siteId });
    const { data: site, error } = await supabase.from("sites")
      .select("account_id, name, business, theme, draft_theme, draft_header").eq("id", siteId).maybeSingle();
    if (error || !site) throw new Error("Could not load the site.", { cause: error });
    const accountId = z.uuid().parse(site.account_id);
    const theme = site.draft_theme ?? site.theme ?? {};
    const url = supabase.storage.from("site-assets").getPublicUrl(path).data.publicUrl;
    themeSchema.parse({ ...z.record(z.string(), z.unknown()).parse(theme), logoUrl: url, logoAlt: alt });
    const name = z.object({ businessName: z.string().optional() }).safeParse(site.business);
    const header = site.draft_header == null
      ? defaultHeader(name.success ? name.data.businessName || site.name : site.name)
      : headerSchema.parse(site.draft_header);
    const updatedHeader = headerSchema.parse({ ...header, logo: { ...header.logo, mode: "image", image: url } });
    await checkpointTemplateLogo(accountId, siteId, generationId, {
      path, url, alt, expectedTheme: theme, expectedHeader: site.draft_header, header: updatedHeader,
    });
    return { status: "success" as const };
  } catch (cause) {
    console.error("Could not apply template logo", { type: cause instanceof Error ? cause.name : "Unknown" });
    return { status: "error" as const, message: cause instanceof AiUserError ? cause.message
      : "The logo could not be applied. Check the site's media library and choose it in the editor." };
  }
}
