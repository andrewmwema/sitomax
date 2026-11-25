"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { businessSchema } from "@/lib/business";
import { isReservedForAccountSite } from "@/lib/reserved-subdomains";

const createTemplateSiteInput = z.object({
  accountId: z.uuid(),
  templateId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,49}$/),
  siteName: z.string().trim().min(1, "Enter a site name.").max(100),
  subdomain: z.string().trim().toLowerCase().min(1).max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens."),
  timezone: z.string().trim().min(1).max(64),
});

const aiBuildInput = z.strictObject({
  generationId: z.uuid(), business: businessSchema,
});

export async function createSiteFromMasterTemplate(raw: unknown, aiBuild?: unknown): Promise<
  | { status: "success"; siteId: string; editorPageId: string; checkpoints?: unknown }
  | { status: "error"; message: string }
> {
  const parsed = createTemplateSiteInput.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the site details and try again." };
  }
  const input = parsed.data;
  const parsedBuild = aiBuild === undefined ? undefined : aiBuildInput.safeParse(aiBuild);
  if (parsedBuild && !parsedBuild.success) {
    return { status: "error", message: "Check the AI build details and try again." };
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    return { status: "error", message: "Choose a valid timezone." };
  }

  const { supabase, user } = await requireUser();
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Could not verify template creation permissions.", { code: profileError.code });
    return { status: "error", message: "Could not verify your permissions. Please retry." };
  }
  const isSuperAdmin = profile?.is_super_admin === true;

  const { data: account, error: accountError } = await supabase.from("accounts")
    .select("id, is_internal")
    .eq("id", input.accountId)
    .maybeSingle();
  if (accountError) {
    console.error("Could not verify template destination account.", { code: accountError.code });
    return { status: "error", message: "Could not verify the selected account. Please retry." };
  }
  if (!account || account.is_internal) {
    return { status: "error", message: "Choose a client account for this site." };
  }
  if (!isSuperAdmin) {
    const { data: membership, error } = await supabase.from("account_members")
      .select("account_id")
      .eq("account_id", input.accountId)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();
    if (error) {
      console.error("Could not verify account-owner permissions.", { code: error.code });
      return { status: "error", message: "Could not verify your account access. Please retry." };
    }
    if (!membership) return { status: "error", message: "Only an account owner can create a site." };
  }
  if (isReservedForAccountSite(input.subdomain, isSuperAdmin, account.is_internal)) {
    return { status: "error", message: "That site address is reserved. Choose another subdomain." };
  }

  const copyParams = {
    p_account_id: input.accountId,
    p_template_id: input.templateId,
    p_site_name: input.siteName,
    p_subdomain: input.subdomain,
    p_timezone: input.timezone,
  };
  const { data, error: createError } = parsedBuild?.success
    ? await supabase.rpc("create_ai_template_site", {
      ...copyParams, p_generation_id: parsedBuild.data.generationId,
      p_business: parsedBuild.data.business,
    })
    : await supabase.rpc("create_site_from_template", copyParams);
  const aiResult = parsedBuild?.success
    ? z.object({ siteId: z.uuid(), editorPageId: z.uuid(), pages: z.unknown() }).safeParse(data)
    : undefined;
  const siteId = aiResult?.success ? aiResult.data.siteId : typeof data === "string" && !parsedBuild ? data : undefined;
  if (createError || !siteId) {
    if (createError?.code === "P0001" && createError.message.includes("SITE_LIMIT_REACHED")) {
      return {
        status: "error",
        message: "Your plan's site limit has been reached. Upgrade your plan or remove an existing site before creating another.",
      };
    }
    if (createError?.code === "P0001" && createError.message === "Not enough credits for the selected pages.") {
      return { status: "error", message: createError.message };
    }
    if (createError?.code === "P0001" && createError.message === "This build is already being created.") {
      return { status: "error", message: createError.message };
    }
    if (createError?.code === "40001") {
      return { status: "error", message: "The selected design changed. Please select it again." };
    }
    if (createError?.code === "23505") {
      return { status: "error", message: "That site address is already in use. Choose another subdomain." };
    }
    if (createError?.code === "42501") {
      return { status: "error", message: "You don't have permission to create a site for this account." };
    }
    console.error("Could not create site from master template.", { code: createError?.code ?? "NoDatabaseCode" });
    return { status: "error", message: "Could not create the site. Please retry." };
  }

  if (aiResult?.success) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/sites");
    return { status: "success", siteId, editorPageId: aiResult.data.editorPageId, checkpoints: aiResult.data.pages };
  }

  const { data: homePage, error: pageError } = await supabase.from("pages")
    .select("id")
    .eq("site_id", siteId)
    .eq("sort_order", 0)
    .maybeSingle();
  if (pageError || !homePage) {
    console.error("Created template site but could not load its home page.", { code: pageError?.code ?? "NoDatabaseCode" });
    return { status: "error", message: "Your site was created, but the editor could not be opened. Find it in your Sites dashboard." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/sites");
  return { status: "success", siteId, editorPageId: homePage.id };
}
