"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { redirectSchema, rootSeoSchema, siteSeoSchema } from "@/lib/seo";
import { publishPage, savePageDraft } from "@/app/editor/[pageId]/actions";

type Result = { error: string; success: string };
const invalid: Result = { error: "Invalid input. Please check the fields.", success: "" };
const pageSeoFieldsSchema = z.strictObject({
  seoTitle: z.string().max(500),
  description: z.string().max(2000),
  socialImage: z.string().max(2048),
  indexing: z.enum(["inherit", "index", "noindex"]),
});
const pageDataSchema = z.looseObject({
  content: z.array(z.looseObject({ type: z.string() })),
  root: z.looseObject({ props: z.looseObject({}).optional() }),
});

async function updatePageSeo(siteId: string, pageId: string, rawFields: unknown, publish: boolean): Promise<Result> {
  const parsedIds = z.object({ siteId: z.uuid(), pageId: z.uuid() }).safeParse({ siteId, pageId });
  const parsedFields = pageSeoFieldsSchema.safeParse(rawFields);
  if (!parsedIds.success || !parsedFields.success) return invalid;
  const fields = parsedFields.data;
  const validatedRoot = rootSeoSchema.safeParse(fields);
  if (!validatedRoot.success) return invalid;
  const { supabase } = await requireUser();
  const { data: page, error: pageError } = await supabase.from("pages")
    .select("id, site_id, draft_data").eq("id", parsedIds.data.pageId).eq("site_id", parsedIds.data.siteId).maybeSingle();
  if (pageError || !page) {
    if (pageError) console.error("Could not load page SEO draft", pageError.message);
    return { error: "Could not load this page.", success: "" };
  }
  const parsedData = pageDataSchema.safeParse(page.draft_data);
  if (!parsedData.success) return { error: "This page draft is invalid and could not be updated.", success: "" };
  const nextData = {
    ...parsedData.data,
    root: {
      ...parsedData.data.root,
      props: { ...parsedData.data.root.props, ...validatedRoot.data },
    },
  };
  const result = await (publish ? publishPage : savePageDraft)(page.id, nextData);
  if (result.status !== "success") return {
    error: result.status === "error" ? result.message : "Page was not updated.",
    success: "",
  };
  revalidatePath(`/dashboard/sites/${siteId}/seo`);
  revalidatePath(`/editor/${pageId}`);
  return { error: "", success: publish ? "Page published with these SEO settings." : "Draft saved. Publish to apply." };
}

export async function savePageSeoDraft(siteId: string, pageId: string, fields: unknown): Promise<Result> {
  return updatePageSeo(siteId, pageId, fields, false);
}

export async function publishPageSeo(siteId: string, pageId: string, fields: unknown): Promise<Result> {
  return updatePageSeo(siteId, pageId, fields, true);
}

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
