"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { mediaAccess } from "@/lib/media-server";
import { MediaError } from "@/lib/media";

/** Documents the link picker can upload and link to (see migration 0027). */
const FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
};
const MAX_FILE_MB = 20;

function failure(cause: unknown) {
  unstable_rethrow(cause);
  console.error("File operation failed", { type: cause instanceof Error ? cause.name : "Unknown" });
  return { status: "error" as const, message: cause instanceof MediaError ? cause.message : "The file request failed. Please retry." };
}

export async function listSiteFiles(raw: unknown) {
  const parsed = z.object({ siteId: z.uuid(), query: z.string().trim().max(100), offset: z.number().int().min(0).max(100000) }).safeParse(raw);
  if (!parsed.success) return { status: "error" as const, message: "Invalid file search." };
  try {
    const { supabase, siteId } = await mediaAccess({ siteId: parsed.data.siteId });
    const { data, error } = await supabase.rpc("list_site_files", { p_site_id: siteId, p_query: parsed.data.query, p_offset: parsed.data.offset });
    if (error) {
      console.error("Could not list site files", { code: error.code });
      return { status: "error" as const, message: "Could not load files. Apply migration 0027 and retry." };
    }
    const rows = z.array(z.object({ path: z.string(), name: z.string(), mimetype: z.string(), size: z.coerce.number() })).parse(data);
    const bucket = supabase.storage.from("site-assets");
    return { status: "success" as const, hasMore: rows.length === 24,
      files: rows.map((row) => ({ url: bucket.getPublicUrl(row.path).data.publicUrl, name: row.name, size: row.size })) };
  } catch (cause) { return failure(cause); }
}

export async function prepareFileUpload(siteId: string, raw: unknown) {
  try {
    const { supabase, siteId: allowedSite } = await mediaAccess({ siteId });
    const file = z.object({ name: z.string().min(1).max(255), type: z.string().max(200), size: z.number().int().positive() }).parse(raw);
    const extension = FILE_TYPES[file.type];
    if (!extension) return { status: "error" as const, message: "Use PDF, Word, Excel, PowerPoint, TXT or CSV files." };
    if (file.size > MAX_FILE_MB * 1024 * 1024) return { status: "error" as const, message: `Files must be ${MAX_FILE_MB} MB or smaller.` };
    const name = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "file";
    const path = `${allowedSite}/${name}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
    return { status: "success" as const, path, name: `${name}.${extension}`,
      url: supabase.storage.from("site-assets").getPublicUrl(path).data.publicUrl };
  } catch (cause) {
    if (cause instanceof z.ZodError) return { status: "error" as const, message: "Invalid file." };
    return failure(cause);
  }
}
