"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { redirectSchema, siteSeoSchema } from "@/lib/seo";

type Result = { error: string; success: string };
const invalid: Result = { error: "Invalid input. Please check the fields.", success: "" };

export async function saveSeo(siteId: string, _previous: Result, formData: FormData): Promise<Result> {
  const parsed = siteSeoSchema.safeParse({
    socialImage: formData.get("socialImage"), googleAnalyticsId: formData.get("googleAnalyticsId"),
    metaPixelId: formData.get("metaPixelId"), googleVerification: formData.get("googleVerification"),
    noindex: formData.get("noindex") === "on",
  });
  if (!z.uuid().safeParse(siteId).success || !parsed.success) return { error: parsed.error?.issues[0]?.message ?? invalid.error, success: "" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("sites").update({ seo: parsed.data }).eq("id", siteId).select("id");
  if (error || !data?.length) {
    console.error("Could not save SEO settings", error?.message ?? "No accessible site.");
    return { error: "Could not save SEO settings.", success: "" };
  }
  revalidatePath(`/dashboard/sites/${siteId}/seo`);
  return { error: "", success: "SEO settings saved." };
}

export async function addRedirect(siteId: string, _previous: Result, formData: FormData): Promise<Result> {
  const parsed = redirectSchema.safeParse({ fromPath: formData.get("fromPath"), toPath: formData.get("toPath") });
  if (!z.uuid().safeParse(siteId).success || !parsed.success) return { error: parsed.error?.issues[0]?.message ?? invalid.error, success: "" };
  if (/^\/(?:api|_next|s)(?:\/|$)|^\/(?:robots\.txt|sitemap\.xml)$/i.test(parsed.data.fromPath)) {
    return { error: "That source path is reserved.", success: "" };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.from("redirects").insert({ site_id: siteId, from_path: parsed.data.fromPath, to_path: parsed.data.toPath });
  if (error) {
    console.error("Could not add redirect", error.message);
    return { error: error.code === "23505" ? "A redirect already exists for that path." : "Could not add redirect.", success: "" };
  }
  revalidatePath(`/dashboard/sites/${siteId}/seo`);
  return { error: "", success: "Redirect added. Changes may take 30 seconds to appear." };
}

export async function deleteRedirect(siteId: string, _previous: Result, formData: FormData): Promise<Result> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success || !z.uuid().safeParse(siteId).success) return invalid;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("redirects").delete().eq("site_id", siteId).eq("id", id.data).select("id");
  if (error || !data?.length) {
    console.error("Could not delete redirect", error?.message ?? "No accessible redirect.");
    return { error: "Could not delete redirect.", success: "" };
  }
  revalidatePath(`/dashboard/sites/${siteId}/seo`);
  return { error: "", success: "Redirect deleted. Changes may take 30 seconds to appear." };
}
