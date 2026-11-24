import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { premiumTemplates } from "../templates/premium";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding templates.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const storage = supabase.storage.from("template-assets");
const seededObjects = new Set<string>();

function collectAssetPaths(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (value.startsWith("/samples/") || value.startsWith("/template-assets/")) found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectAssetPaths(item, found);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) collectAssetPaths(child, found);
  }
  return found;
}

function assetDetails(templateId: string, assetPath: string) {
  const isSample = assetPath.startsWith("/samples/");
  const relativePath = assetPath.slice(isSample ? "/samples/".length : "/template-assets/".length);
  if (!relativePath || relativePath.split("/").some((part) => part === "..")) {
    throw new Error(`Invalid template asset path: ${assetPath}`);
  }
  const sourcePath = isSample
    ? path.resolve("public/samples", relativePath)
    : path.resolve("templates/assets", relativePath);
  const objectPath = isSample
    ? `masters/shared/${relativePath}`
    : `masters/${templateId}/${relativePath}`;
  const extension = path.extname(relativePath).toLowerCase();
  const contentType = extension === ".svg" ? "image/svg+xml"
    : extension === ".png" ? "image/png"
    : extension === ".webp" ? "image/webp"
    : "image/jpeg";
  return { sourcePath, objectPath, contentType };
}

async function publicAssetUrl(templateId: string, assetPath: string): Promise<string> {
  const { sourcePath, objectPath, contentType } = assetDetails(templateId, assetPath);
  if (!seededObjects.has(objectPath)) {
    const bytes = await readFile(sourcePath);
    const { error } = await storage.upload(objectPath, bytes, {
      contentType,
      cacheControl: "31536000",
      upsert: true,
    });
    if (error) {
      console.error("Could not upload a premium template asset.", { code: error.statusCode });
      throw new Error("Premium template asset upload failed.");
    }
    seededObjects.add(objectPath);
  }
  return storage.getPublicUrl(objectPath).data.publicUrl;
}

function rewriteAssetReferences(value: unknown, urls: Map<string, string>): unknown {
  if (typeof value === "string") return urls.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rewriteAssetReferences(item, urls));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, rewriteAssetReferences(child, urls)]),
    );
  }
  return value;
}

for (const template of Object.values(premiumTemplates)) {
  const source = {
    previewImage: template.previewImage,
    pages: template.pages.map(({ title, slug, nav_label, data }) => ({ title, slug, nav_label, data })),
  };
  const assetPaths = collectAssetPaths(source);
  const urls = new Map<string, string>();
  for (const assetPath of assetPaths) {
    urls.set(assetPath, await publicAssetUrl(template.key, assetPath));
  }

  const rewritten = rewriteAssetReferences(source, urls) as typeof source;
  const { error } = await supabase.from("site_templates").upsert({
    id: template.key,
    name: template.name,
    description: template.description,
    best_for: template.bestFor,
    preview_image: rewritten.previewImage,
    theme: template.theme,
    business: template.business,
    pages: rewritten.pages,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) {
    console.error("Could not save a premium template.", { templateId: template.key, code: error.code });
    throw new Error(`Premium template seed failed for "${template.key}".`);
  }
}

console.info(`Seeded ${Object.keys(premiumTemplates).length} premium website templates.`);
