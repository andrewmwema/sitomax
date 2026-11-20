"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { blogPostFieldsSchema, blogPublicationSnapshot, blogSlugify, readingMinutes, type BlogBlock } from "@/lib/blog";
import { IMPORT_BATCH, IMPORT_BYTES, parseBlogImport, type ImportedPost } from "@/lib/blog-import";
import { fetchBlogImport, importImageType } from "@/lib/blog-import-fetch";

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];
type Result = { title: string; slug?: string; status: "imported" | "skipped" | "error"; message?: string };

async function loadImport(siteId: string, form: FormData) {
  const { supabase } = await requireUser();
  const site = await supabase.from("sites").select("id").eq("id", siteId).maybeSingle();
  if (site.error || !site.data) {
    if (site.error) console.error("Could not verify blog import access", { code: site.error.code });
    throw new Error("This site is unavailable.");
  }
  const settings = await supabase.from("blog_settings").select("blog_path").eq("site_id", siteId).maybeSingle();
  if (settings.error) {
    console.error("Could not read blog import settings", { code: settings.error.code });
    throw new Error("Could not read the site's blog settings.");
  }
  const blogPath = settings.data?.blog_path ?? "/blog";
  const file = form.get("file");
  const feed = form.get("feed");
  let bytes: Uint8Array;
  let url: string | undefined;
  if (file instanceof File && file.size && !feed) {
    if (file.size > IMPORT_BYTES) throw new Error("Choose an XML file no larger than 2 MB.");
    bytes = new Uint8Array(await file.arrayBuffer());
  } else if (typeof feed === "string" && feed && !(file instanceof File && file.size)) {
    const parsed = z.url().max(2048).safeParse(feed.trim());
    if (!parsed.success) throw new Error("Enter a valid feed URL.");
    try {
      const source = await fetchBlogImport(parsed.data, IMPORT_BYTES, AbortSignal.timeout(8000));
      bytes = source.bytes;
      url = source.url;
    } catch (error) {
      console.warn("Blog feed download failed", { type: (error as Error).name });
      throw new Error("Could not download the feed. Use a public HTTPS RSS or Atom URL (up to 2 MB).");
    }
  } else throw new Error("Choose one XML file or one feed URL.");
  const xml = new TextDecoder().decode(bytes);
  return {
    supabase,
    entries: parseBlogImport(xml, blogPath, url),
    digest: createHash("sha256").update(JSON.stringify([blogPath, url ?? null])).update(bytes).digest("hex"),
  };
}

export async function previewBlogImport(siteId: string, form: FormData) {
  if (!z.uuid().safeParse(siteId).success) return { error: "Invalid site." } as const;
  try {
    const { supabase, entries, digest } = await loadImport(siteId, form);
    const slugs = [...new Set(entries.flatMap((entry) => "post" in entry ? [entry.post.slug] : []))];
    const existing = new Set<string>();
    for (let offset = 0; offset < slugs.length; offset += 10) {
      const count = await supabase.from("posts").select("slug").eq("site_id", siteId).in("slug", slugs.slice(offset, offset + 10));
      if (count.error) {
        console.error("Could not check blog import duplicates", { code: count.error.code });
        return { error: "Could not check for duplicate posts." } as const;
      }
      for (const post of count.data) existing.add(post.slug);
    }
    const seen = new Set<string>();
    return { digest, batchSize: IMPORT_BATCH, rows: entries.map((entry) => {
      if ("error" in entry) return { title: entry.title, error: entry.error };
      const { slug, author, date, excerpt, category, published, cover } = entry.post;
      const repeated = seen.has(slug);
      seen.add(slug);
      return { title: entry.title, slug, author, date, excerpt, category, published,
        hasCover: Boolean(cover), duplicate: existing.has(slug), repeated };
    }) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not preview this source." };
  }
}

async function writePost(supabase: Client, siteId: string, post: ImportedPost, overwrite: boolean, keepPublished: boolean): Promise<Result> {
  const info = { title: post.title, slug: post.slug };
  const paths: string[] = [];
  const media = supabase.storage.from("site-assets");
  try {
    const existing = await supabase.from("posts").select("id").eq("site_id", siteId).eq("slug", post.slug).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data && !overwrite) return { ...info, status: "skipped", message: "This slug already exists." };
    const images = new Map<string, string>();
    const sourceUrls = [...new Set([...(post.cover ? [post.cover.url] : []), ...post.blocks.flatMap((b) => b.type === "image" ? [b.url] : [])])];
    const signal = AbortSignal.timeout(8000);
    for (const source of sourceUrls.slice(0, 12)) {
      try {
        const remote = await fetchBlogImport(source.replace(/^http:/, "https:"), 3 * 1024 * 1024, signal);
        const type = importImageType(remote.bytes);
        if (!type) throw new Error("Unsupported image format.");
        const path = `${siteId}/blog-import-${randomUUID()}.${type.ext}`;
        const uploaded = await media.upload(path, new Uint8Array(remote.bytes), { contentType: type.mime });
        if (uploaded.error) throw uploaded.error;
        paths.push(path);
        images.set(source, media.getPublicUrl(path).data.publicUrl);
      } catch (error) {
        console.warn("Blog import image could not be copied", { type: error instanceof Error ? error.name : "unknown" });
      }
    }
    const omitted = sourceUrls.length - images.size;
    const blocks = post.blocks.flatMap<BlogBlock>((block) => {
      if (block.type !== "image") return [block];
      const url = images.get(block.url);
      return url ? [{ ...block, url }] : [];
    });
    const cover = post.cover ? images.get(post.cover.url) ?? "" : "";
    const fields = blogPostFieldsSchema.parse({
      title: post.title, slug: post.slug, subtitle: "", excerpt: post.excerpt,
      draft_content: { version: 1, blocks }, cover_image: cover, cover_alt: cover ? post.cover?.alt ?? "" : "",
      thumbnail_image: "", thumbnail_alt: "", author_id: null, category_id: null, tag_ids: [],
      featured: false, layout_override: null, seo_title: "", seo_description: "", canonical_url: "", noindex: false,
    });
    const categorySlug = blogSlugify(post.category).replaceAll("/", "-");
    const category = categorySlug ? { name: post.category, slug: categorySlug } : null;
    const tags = [...new Map(post.tags.flatMap((name) => {
      const slug = blogSlugify(name).replaceAll("/", "-");
      return slug ? [[slug, { name, slug }] as const] : [];
    })).values()];
    const publish = keepPublished && post.published;
    const minutes = readingMinutes(fields.draft_content);
    const publication = publish ? blogPublicationSnapshot(fields, fields.draft_content,
      post.author ? { name: post.author, bio: "", photo: "" } : null, category, tags, minutes) : null;
    const result = await supabase.rpc("import_blog_post", {
      p_site_id: siteId, p_author: post.author, p_category: category, p_tags: tags, p_overwrite: overwrite,
      p_post: {
        slug: fields.slug, title: fields.title, excerpt: fields.excerpt, draft_content: fields.draft_content,
        cover_image: fields.cover_image, cover_alt: fields.cover_alt, reading_minutes: minutes,
        status: publish ? "published" : "draft", published_content: publication,
        published_at: publish ? post.date ?? new Date().toISOString() : null, created_at: post.date,
      },
    });
    if (result.error) throw result.error;
    if (result.data === "imported") return { ...info, status: "imported",
      ...(omitted ? { message: `${omitted} image${omitted === 1 ? "" : "s"} could not be copied and were omitted.` } : {}) };
    if (result.data !== "skipped") throw new Error("Unexpected import result.");
    if (paths.length) await removeImportImages(media, paths);
    return { ...info, status: "skipped", message: "This slug already exists." };
  } catch (error) {
    if (paths.length) await removeImportImages(media, paths);
    console.error("Blog import could not save post", { code: error && typeof error === "object" && "code" in error ? error.code : undefined });
    return { ...info, status: "error", message: "Could not save this post. Check the blog import migration and retry." };
  }
}

async function removeImportImages(media: ReturnType<Client["storage"]["from"]>, paths: string[]) {
  const { error } = await media.remove(paths);
  if (error) console.error("Could not clean up blog import images", { code: error.statusCode });
}

export async function importBlogBatch(siteId: string, form: FormData, options: unknown) {
  const parsed = z.strictObject({
    digest: z.string().regex(/^[0-9a-f]{64}$/), offset: z.number().int().min(0).max(249),
    overwrite: z.boolean(), keepPublished: z.boolean(),
  }).safeParse(options);
  if (!parsed.success || !z.uuid().safeParse(siteId).success) return { error: "Invalid import request." } as const;
  try {
    const { supabase, entries, digest } = await loadImport(siteId, form);
    if (parsed.data.digest !== digest) return { error: "The source or blog path changed. Preview it again before importing." } as const;
    const results: Result[] = [];
    const seen = new Set(entries.slice(0, parsed.data.offset).flatMap((entry) => "post" in entry ? [entry.post.slug] : []));
    for (const entry of entries.slice(parsed.data.offset, parsed.data.offset + IMPORT_BATCH)) {
      if ("error" in entry) results.push({ title: entry.title, status: "error", message: entry.error });
      else if (seen.has(entry.post.slug)) {
        results.push({ title: entry.title, slug: entry.post.slug, status: "skipped", message: "This slug is repeated in the source." });
      } else {
        seen.add(entry.post.slug);
        results.push(await writePost(supabase, siteId, entry.post, parsed.data.overwrite, parsed.data.keepPublished));
      }
    }
    if (results.some(({ status }) => status === "imported")) {
      revalidatePath(`/dashboard/sites/${siteId}/blog`);
      revalidatePath("/s/[site]/[[...slug]]", "page");
    }
    return { results };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not import this source." };
  }
}
