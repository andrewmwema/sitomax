import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { premiumTemplates } from "../templates/premium";

type MasterRow = { id: string; preview_image: string; updated_at: string };
type Database = { public: {
  Tables: { site_templates: { Row: MasterRow; Insert: MasterRow; Update: Partial<MasterRow>; Relationships: [] } };
  Views: Record<string, never>;
  Functions: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
} };
type Client = ReturnType<typeof createClient<Database>>;
const ids = ["showcase", "clarity", "studio"] as const;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function syncPremiumThumbnails(supabase: Client, apply: boolean) {
  const bucket = supabase.storage.from("template-assets");
  const { data: rows, error } = await supabase.from("site_templates")
    .select("id, preview_image, updated_at").in("id", [...ids]);
  if (error) throw new Error("Could not read the master templates.", { cause: error });
  if (!rows || rows.length !== ids.length || ids.some((id) => !rows.some((row) => row.id === id))) {
    throw new Error("All three master template rows must already exist.");
  }

  const plan = [];
  for (const id of ids) {
    const template = premiumTemplates[id];
    const match = template.previewImage.match(new RegExp(`^/template-assets/${id}-thumbnail-([a-f0-9]{16})\\.png$`));
    if (!match) throw new Error(`Invalid thumbnail path for ${id}.`);
    const filename = path.basename(template.previewImage);
    const bytes = await readFile(path.join(process.cwd(), "templates/assets", filename));
    const hash = sha256(bytes);
    if (!hash.startsWith(match[1])) throw new Error(`Thumbnail hash does not match its filename for ${id}.`);

    const objectPath = `masters/${id}/${filename}`;
    const { data: existing, error: downloadError } = await bucket.download(objectPath, {}, { cache: "no-store" });
    if (downloadError && downloadError.status !== 404 && downloadError.statusCode !== "404") {
      throw new Error(`Could not check the ${id} thumbnail.`, { cause: downloadError });
    }
    if (existing && sha256(new Uint8Array(await existing.arrayBuffer())) !== hash) {
      throw new Error(`The immutable ${id} thumbnail path already contains different bytes.`);
    }
    if (!existing && !downloadError) throw new Error(`Could not verify the ${id} thumbnail.`);
    const row = rows.find((item) => item.id === id);
    if (!row || typeof row.preview_image !== "string" || typeof row.updated_at !== "string") {
      throw new Error(`Invalid master row for ${id}.`);
    }
    plan.push({ id, bytes, hash, objectPath, exists: Boolean(existing), row,
      url: bucket.getPublicUrl(objectPath).data.publicUrl });
  }

  for (const item of plan) {
    console.info(`${item.id}: ${item.exists ? "asset already present" : "new asset"}, ${item.row.preview_image === item.url ? "row already current" : "update preview_image"}`);
  }
  if (!apply) {
    console.info("Dry run only; no changes made.");
    return;
  }

  for (const item of plan) {
    if (!item.exists) {
      const { error: uploadError } = await bucket.upload(item.objectPath, item.bytes, {
        contentType: "image/png", cacheControl: "31536000", upsert: false,
      });
      if (uploadError) throw new Error(`Could not upload the ${item.id} thumbnail; retry after review.`, { cause: uploadError });
      const { data: uploaded, error: verifyError } = await bucket.download(item.objectPath, {}, { cache: "no-store" });
      if (verifyError || !uploaded || sha256(new Uint8Array(await uploaded.arrayBuffer())) !== item.hash) {
        throw new Error(`Could not verify the uploaded ${item.id} thumbnail; no remaining rows were updated.`, { cause: verifyError });
      }
    }
  }

  for (const item of plan) {
    if (item.row.preview_image === item.url) continue;
    const { data: updated, error: updateError } = await supabase.from("site_templates")
      .update({ preview_image: item.url, updated_at: new Date().toISOString() })
      .eq("id", item.id).eq("preview_image", item.row.preview_image).eq("updated_at", item.row.updated_at)
      .select("id");
    if (updateError || updated?.length !== 1) {
      throw new Error(`The ${item.id} row could not be updated or changed concurrently; earlier updates may have succeeded.`, { cause: updateError });
    }
    console.info(`${item.id}: thumbnail updated.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply") || args.length > 1) {
    throw new Error("Usage: vite-node --config vitest.config.ts scripts/sync-premium-thumbnails.ts [--apply]");
  }
  const apply = args.includes("--apply");
  if (apply && process.env.PREMIUM_THUMBNAIL_SYNC_APPROVED !== "YES") {
    throw new Error("Obtain explicit approval and set PREMIUM_THUMBNAIL_SYNC_APPROVED=YES before applying.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const expected = process.env.PREMIUM_THUMBNAIL_EXPECTED_PROJECT_URL;
  if (!url || !key || !expected || new URL(url).href !== new URL(expected).href) {
    throw new Error("Set the Supabase URL, service-role key and matching expected project URL explicitly.");
  }
  const supabase = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  await syncPremiumThumbnails(supabase, apply);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Thumbnail sync failed.");
  process.exitCode = 1;
});
