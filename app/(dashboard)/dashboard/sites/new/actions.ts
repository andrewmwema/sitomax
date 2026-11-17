"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSiteCreationSchema, createSubdomainSchema } from "@/lib/site-creation";
import { findUnreplacedPlaceholders } from "@/lib/sections/placeholders";
import { instantiateTemplate } from "@/templates/instantiate";
import { templates } from "@/templates";
import { brand } from "@/lib/brand";

export async function checkSubdomain(raw: unknown) {
  const { supabase } = await requireSuperAdmin();
  const parsed = createSubdomainSchema(brand.marketingSiteSubdomain).safeParse(raw);
  if (!parsed.success) return { available: false, message: parsed.error.issues[0]?.message ?? "Invalid subdomain." };
  const { data, error } = await supabase.from("sites").select("id").eq("subdomain", parsed.data).maybeSingle();
  if (error) {
    console.error("Could not check subdomain", error);
    return { available: false, message: "Could not check availability. Please retry." };
  }
  return { available: !data, message: data ? "This subdomain is already in use." : "This subdomain is available." };
}

export async function createSite(raw: unknown): Promise<{ status: "success"; siteId: string } | { status: "error"; message: string }> {
  const { supabase } = await requireSuperAdmin();
  const parsed = createSiteCreationSchema(brand.marketingSiteSubdomain).safeParse(raw);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid site information." };
  const input = parsed.data;
  const { data: account, error: accountError } = await supabase.from("accounts").select("id").eq("id", input.accountId).maybeSingle();
  if (accountError) {
    console.error("Could not load client account", accountError);
    return { status: "error", message: "Could not verify the client account. Please retry." };
  }
  if (!account) return { status: "error", message: "The selected client account no longer exists." };

  const template = templates[input.template];
  const pages = instantiateTemplate(template, input);
  if (pages.some((page) => findUnreplacedPlaceholders(page.data).length)) {
    return { status: "error", message: "This template contains unfilled sample content and cannot be published yet." };
  }
  const admin = createAdminClient();
  const { data: siteId, error } = await admin.rpc("create_template_site", {
    p_account_id: input.accountId, p_name: input.businessName, p_subdomain: input.subdomain,
    p_template_key: input.template, p_theme: template.theme, p_pages: pages,
  });
  if (error || typeof siteId !== "string") {
    console.error("Could not create template site", error);
    return { status: "error", message: error?.code === "23505"
      ? "This subdomain is already in use." : "Could not create the site. Check that the site-creation migration is applied, then retry." };
  }
  revalidatePath("/dashboard");
  return { status: "success", siteId };
}
