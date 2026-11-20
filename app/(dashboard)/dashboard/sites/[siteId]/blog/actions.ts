"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  blogContentSchema, blogPostFieldsSchema, blogPublicationSnapshot, blogSlugify, readingMinutes, sanitizeBlogContent,
  type BlogPostFields,
} from "@/lib/blog";
import { siteLocalTimeToUtc } from "@/lib/blog-date";

type ActionResult = { status: "success"; message: string; postId?: string; tagId?: string; content?: z.infer<typeof blogContentSchema> }
  | { status: "error"; message: string };
const failed = (message: string): ActionResult => ({ status: "error", message });
const ok = (message: string, postId?: string): ActionResult => ({ status: "success", message, postId });
const uuid = z.uuid();

function refresh(siteId: string) {
  revalidatePath(`/dashboard/sites/${siteId}/blog`);
  revalidatePath("/s/[site]/[[...slug]]", "page");
}

function slugifyLabel(value: string) {
  return blogSlugify(value).replaceAll("/", "-").slice(0, 160) || "category";
}

async function ensureAuthor(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], siteId: string, user: { id: string; email?: string }) {
  const { data: existing, error: existingError } = await supabase.from("blog_authors")
    .select("id").eq("site_id", siteId).eq("user_id", user.id).maybeSingle();
  if (existingError) throw new Error("Could not load the author profile.", { cause: existingError });
  if (existing) return existing.id as string;
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("full_name").eq("id", user.id).maybeSingle();
  if (profileError) throw new Error("Could not load the writer profile.", { cause: profileError });
  const name = profile?.full_name?.trim() || user.email?.split("@")[0]?.trim() || "Author";
  const { data: author, error } = await supabase.from("blog_authors")
    .insert({ site_id: siteId, user_id: user.id, name: name.slice(0, 120) })
    .select("id").single();
  if (error || !author) throw new Error("Could not create an author profile.", { cause: error });
  return author.id as string;
}

async function createPublicationSnapshot(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  post: Omit<BlogPostFields, "tag_ids" | "draft_content"> & {
    id: string; site_id: string; draft_content: unknown;
  },
) {
  const [authorResult, categoryResult, tagLinksResult] = await Promise.all([
    post.author_id
      ? supabase.from("blog_authors").select("name, bio, photo").eq("site_id", post.site_id).eq("id", post.author_id).maybeSingle()
      : null,
    post.category_id
      ? supabase.from("post_categories").select("name, slug").eq("site_id", post.site_id).eq("id", post.category_id).maybeSingle()
      : null,
    supabase.from("post_tag_links").select("tag_id").eq("site_id", post.site_id).eq("post_id", post.id as string),
  ]);
  if (authorResult?.error || categoryResult?.error || tagLinksResult.error) {
    return { error: "Could not load post details for publishing." as const };
  }
  const tagIds = (tagLinksResult.data ?? []).map(({ tag_id }) => tag_id);
  const tagResult = tagIds.length
    ? await supabase.from("post_tags").select("name, slug").eq("site_id", post.site_id).in("id", tagIds)
    : { data: [], error: null };
  if (tagResult.error) return { error: "Could not load post tags for publishing." as const };

  const content = sanitizeBlogContent(post.draft_content);
  const fields = blogPostFieldsSchema.parse({
    ...post,
    draft_content: content,
    tag_ids: tagIds,
  });
  return {
    snapshot: blogPublicationSnapshot(
      fields, content,
      authorResult?.data ?? null,
      categoryResult?.data ?? null,
      tagResult.data ?? [],
      readingMinutes(content),
    ),
  };
}

export async function createBlogPost(siteId: string, raw: unknown): Promise<ActionResult> {
  const input = z.strictObject({
    title: z.string().trim().min(1).max(200),
    authorId: uuid.nullable().optional(),
    coverImage: z.string().max(2048).optional(),
    coverAlt: z.string().max(500).optional(),
  }).safeParse(raw);
  if (!uuid.safeParse(siteId).success || !input.success) return failed("Enter a title of 1–200 characters.");
  const { supabase, user } = await requireUser();
  const authorId = input.data.authorId ?? await ensureAuthor(supabase, siteId, user);
  const author = await supabase.from("blog_authors").select("id").eq("id", authorId).eq("site_id", siteId).maybeSingle();
  if (author.error || !author.data) return failed("Choose an author for this site.");
  const base = blogSlugify(input.data.title) || "post";
  const existing = await supabase.from("posts").select("slug").eq("site_id", siteId).like("slug", `${base}%`);
  if (existing.error) {
    console.error("Could not check blog post slugs", { code: existing.error.code });
    return failed("Could not create this post.");
  }
  const taken = new Set((existing.data ?? []).map(({ slug }) => slug));
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix++) slug = `${base.slice(0, 990)}-${suffix}`;
  const { data: post, error } = await supabase.from("posts").insert({
    site_id: siteId, title: input.data.title, slug, author_id: authorId,
    cover_image: input.data.coverImage ?? "", cover_alt: input.data.coverAlt ?? "",
    draft_content: { version: 1, blocks: [] },
  }).select("id").single();
  if (error || !post) {
    console.error("Could not create blog post", { code: error?.code });
    return failed(error?.code === "23505" ? "A post already uses that URL. Try again." : "Could not create this post.");
  }
  refresh(siteId);
  return ok("Post created. Start writing.", post.id as string);
}

export async function saveBlogPost(postId: string, raw: unknown): Promise<ActionResult> {
  const parsedId = uuid.safeParse(postId);
  const input = blogPostFieldsSchema.safeParse(raw);
  if (!parsedId.success || !input.success) return failed(input.success ? "Invalid post." : input.error.issues[0]?.message ?? "Invalid post.");
  const { supabase } = await requireUser();
  const { data: current, error: loadError } = await supabase.from("posts")
    .select("id, site_id, status, has_unpublished_changes, draft_content, title, subtitle, slug, excerpt, cover_image, cover_alt, thumbnail_image, thumbnail_alt, author_id, category_id, featured, layout_override, seo_title, seo_description, canonical_url, noindex")
    .eq("id", parsedId.data).maybeSingle();
  if (loadError || !current) {
    if (loadError) console.error("Could not load blog post for saving", { code: loadError.code });
    return failed("This post is unavailable.");
  }
  const { data: currentTags, error: currentTagsError } = await supabase.from("post_tag_links")
    .select("tag_id").eq("post_id", parsedId.data);
  if (currentTagsError) return failed("Could not load the post's current tags.");
  const fields = input.data;
  const content = sanitizeBlogContent(fields.draft_content);
  const [author, category, tags] = await Promise.all([
    fields.author_id ? supabase.from("blog_authors").select("id").eq("id", fields.author_id).eq("site_id", current.site_id).maybeSingle() : null,
    fields.category_id ? supabase.from("post_categories").select("id").eq("id", fields.category_id).eq("site_id", current.site_id).maybeSingle() : null,
    fields.tag_ids.length ? supabase.from("post_tags").select("id").eq("site_id", current.site_id).in("id", fields.tag_ids) : null,
  ]);
  if ((fields.author_id && (!author || author.error || !author.data)) ||
    (fields.category_id && (!category || category.error || !category.data)) ||
    (tags && (tags.error || tags.data.length !== new Set(fields.tag_ids).size))) {
    return failed("Choose only authors, categories and tags from this site.");
  }
  const {
    title: oldTitle, subtitle: oldSubtitle, slug: oldSlug, excerpt: oldExcerpt, draft_content: oldContent,
    cover_image: oldCover, cover_alt: oldCoverAlt, thumbnail_image: oldThumbnail, thumbnail_alt: oldThumbnailAlt,
    author_id: oldAuthor, category_id: oldCategory, featured: oldFeatured, layout_override: oldLayout,
    seo_title: oldSeoTitle, seo_description: oldSeoDescription, canonical_url: oldCanonical, noindex: oldNoindex,
  } = current;
  const { tag_ids: nextTags, ...nextFields } = fields;
  const changed = JSON.stringify({
    title: oldTitle, subtitle: oldSubtitle, slug: oldSlug, excerpt: oldExcerpt, draft_content: oldContent,
    cover_image: oldCover, cover_alt: oldCoverAlt, thumbnail_image: oldThumbnail, thumbnail_alt: oldThumbnailAlt,
    author_id: oldAuthor, category_id: oldCategory, featured: oldFeatured, layout_override: oldLayout,
    seo_title: oldSeoTitle, seo_description: oldSeoDescription, canonical_url: oldCanonical, noindex: oldNoindex,
  }) !== JSON.stringify({ ...nextFields, draft_content: content }) ||
    [...(currentTags ?? []).map(({ tag_id }) => tag_id)].sort().join(",") !== [...new Set(nextTags)].sort().join(",");
  const postUpdate = {
    title: fields.title, subtitle: fields.subtitle, slug: fields.slug, excerpt: fields.excerpt,
    draft_content: content, cover_image: fields.cover_image, cover_alt: fields.cover_alt,
    thumbnail_image: fields.thumbnail_image, thumbnail_alt: fields.thumbnail_alt,
    author_id: fields.author_id, category_id: fields.category_id, featured: fields.featured,
    layout_override: fields.layout_override, seo_title: fields.seo_title, seo_description: fields.seo_description,
    canonical_url: fields.canonical_url, noindex: fields.noindex, reading_minutes: readingMinutes(content),
    has_unpublished_changes: current.status === "published"
      ? current.has_unpublished_changes || changed : current.has_unpublished_changes,
  };
  const { error } = await supabase.from("posts").update(postUpdate).eq("id", parsedId.data);
  if (error) {
    console.error("Could not save blog post", { code: error.code });
    return failed(error.code === "23505" ? "Another post already uses this URL." : "Could not save this post.");
  }
  const { error: clearError } = await supabase.from("post_tag_links").delete().eq("post_id", parsedId.data);
  if (clearError) {
    console.error("Could not replace post tags", { code: clearError.code });
    return failed("The post was saved, but its tags could not be updated.");
  }
  if (fields.tag_ids.length) {
    const { error: linkError } = await supabase.from("post_tag_links").insert(
      [...new Set(fields.tag_ids)].map((tag_id) => ({ site_id: current.site_id, post_id: parsedId.data, tag_id })),
    );
    if (linkError) {
      console.error("Could not update post tags", { code: linkError.code });
      return failed("The post was saved, but its tags could not be updated.");
    }
  }
  refresh(current.site_id);
  return ok("Draft saved.");
}

export async function setBlogPostStatus(postId: string, status: "draft" | "scheduled" | "published", localTime?: string): Promise<ActionResult> {
  const id = uuid.safeParse(postId);
  if (!id.success || !["draft", "scheduled", "published"].includes(status)) return failed("Invalid post status.");
  const { supabase } = await requireUser();
  const { data: post, error: loadError } = await supabase.from("posts")
    .select("id, site_id, status, draft_content, title, subtitle, slug, excerpt, cover_image, cover_alt, thumbnail_image, thumbnail_alt, author_id, category_id, featured, layout_override, seo_title, seo_description, canonical_url, noindex")
    .eq("id", id.data).maybeSingle();
  if (loadError || !post) return failed("This post is unavailable.");
  let publishAt: string | null = null;
  if (status === "scheduled") {
    const { data: site, error: siteError } = await supabase.from("sites").select("timezone").eq("id", post.site_id).maybeSingle();
    if (siteError || !site) return failed("Could not load the site timezone.");
    publishAt = localTime ? siteLocalTimeToUtc(localTime, site.timezone) : null;
    if (!publishAt || new Date(publishAt).getTime() <= Date.now()) return failed("Choose a future date and time in the site timezone.");
  }
  let update;
  if (status === "published") {
    const publication = await createPublicationSnapshot(supabase, post);
    if (!("snapshot" in publication)) return failed(publication.error);
    update = { status, published_content: publication.snapshot, published_at: new Date().toISOString(), publish_at: null, has_unpublished_changes: false };
  } else if (status === "scheduled") {
    update = { status, publish_at: publishAt, has_unpublished_changes: post.status === "published" };
  } else {
    update = { status, publish_at: null, has_unpublished_changes: false };
  }
  const { error } = await supabase.from("posts").update(update).eq("id", id.data);
  if (error) {
    console.error("Could not change blog post status", { code: error.code });
    return failed("Could not update the post status.");
  }
  refresh(post.site_id);
  return ok(status === "published" ? (post.status === "published" ? "Post republished." : "Post published.")
    : status === "scheduled" ? "Post scheduled." : "Post unpublished.");
}

export async function duplicateBlogPost(postId: string): Promise<ActionResult> {
  if (!uuid.safeParse(postId).success) return failed("Invalid post.");
  const { supabase } = await requireUser();
  const { data: source, error } = await supabase.from("posts")
    .select("site_id, title, slug, subtitle, excerpt, draft_content, cover_image, cover_alt, thumbnail_image, thumbnail_alt, author_id, category_id, featured, layout_override, seo_title, seo_description, canonical_url, noindex")
    .eq("id", postId).maybeSingle();
  if (error || !source) return failed("This post is unavailable.");
  const slugBase = `${source.slug.slice(0, 980)}-copy`;
  const existing = await supabase.from("posts").select("slug").eq("site_id", source.site_id).like("slug", `${slugBase}%`);
  if (existing.error) return failed("Could not duplicate this post.");
  const taken = new Set((existing.data ?? []).map(({ slug }) => slug));
  let slug = slugBase;
  for (let suffix = 2; taken.has(slug); suffix++) slug = `${slugBase.slice(0, 990)}-${suffix}`;
  const { data: clone, error: cloneError } = await supabase.from("posts").insert({
    ...source, title: `${source.title} (copy)`.slice(0, 200), slug,
    published_content: null, published_at: null, publish_at: null, status: "draft", has_unpublished_changes: false,
  }).select("id").single();
  if (cloneError || !clone) return failed("Could not duplicate this post.");
  const { data: tags, error: tagsError } = await supabase.from("post_tag_links").select("tag_id").eq("post_id", postId);
  if (tagsError) return failed("The duplicate was created, but its tags could not be loaded.");
  if (tags?.length) {
    const { error: linksError } = await supabase.from("post_tag_links").insert(
      tags.map(({ tag_id }) => ({ site_id: source.site_id, post_id: clone.id, tag_id })),
    );
    if (linksError) {
      console.error("Could not copy blog post tags", { code: linksError.code });
      return failed("The duplicate was created, but its tags could not be copied.");
    }
  }
  refresh(source.site_id);
  return ok("Draft duplicated.", clone.id as string);
}

export async function deleteBlogPost(postId: string): Promise<ActionResult> {
  if (!uuid.safeParse(postId).success) return failed("Invalid post.");
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("posts").delete().eq("id", postId).select("site_id");
  if (error || !data?.length) {
    console.error("Could not delete blog post", { code: error?.code });
    return failed("Could not delete this post.");
  }
  refresh(data[0].site_id);
  return ok("Post deleted.");
}

export async function bulkBlogPostStatus(siteId: string, postIds: string[], status: "draft" | "published" | "delete"): Promise<ActionResult> {
  const parsed = z.object({ siteId: uuid, postIds: z.array(uuid).min(1).max(100), status: z.enum(["draft", "published", "delete"]) })
    .safeParse({ siteId, postIds, status });
  if (!parsed.success) return failed("Choose one or more posts.");
  const { supabase } = await requireUser();
  const ids = [...new Set(parsed.data.postIds)];
  if (status === "published") {
    const { data: posts, error: loadError } = await supabase.from("posts")
      .select("id, site_id, draft_content, title, subtitle, slug, excerpt, cover_image, cover_alt, thumbnail_image, thumbnail_alt, author_id, category_id, featured, layout_override, seo_title, seo_description, canonical_url, noindex")
      .eq("site_id", siteId).in("id", ids);
    if (loadError || !posts?.length) return failed("Could not load the selected posts.");
    for (const post of posts) {
      const publication = await createPublicationSnapshot(supabase, post);
      if (!("snapshot" in publication)) return failed(publication.error);
      const { error } = await supabase.from("posts").update({
        status: "published", published_content: publication.snapshot,
        published_at: new Date().toISOString(), publish_at: null, has_unpublished_changes: false,
      }).eq("site_id", siteId).eq("id", post.id);
      if (error) {
        console.error("Could not publish selected blog post", { code: error.code });
        return failed("Some selected posts could not be published.");
      }
    }
  } else {
    const result = status === "delete"
      ? await supabase.from("posts").delete().eq("site_id", siteId).in("id", ids).select("id")
      : await supabase.from("posts").update({ status: "draft", publish_at: null, has_unpublished_changes: false })
        .eq("site_id", siteId).in("id", ids).select("id");
    if (result.error || !result.data?.length) {
      console.error("Could not apply bulk blog action", { code: result.error?.code });
      return failed("Could not update the selected posts.");
    }
  }
  refresh(siteId);
  return ok("Selected posts updated.");
}

export async function saveBlogCategory(siteId: string, categoryId: string | null, raw: unknown): Promise<ActionResult> {
  const input = z.strictObject({
    name: z.string().trim().min(1).max(100), slug: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000),
  }).safeParse(raw);
  if (!uuid.safeParse(siteId).success || (categoryId !== null && !uuid.safeParse(categoryId).success) || !input.success)
    return failed("Enter a category name and valid URL slug.");
  const { supabase } = await requireUser();
  const values = { name: input.data.name, slug: slugifyLabel(input.data.slug), description: input.data.description };
  const result = categoryId
    ? await supabase.from("post_categories").update(values).eq("id", categoryId).eq("site_id", siteId).select("id")
    : await supabase.from("post_categories").insert({ ...values, site_id: siteId }).select("id");
  if (result.error || !result.data?.length) {
    console.error("Could not save blog category", { code: result.error?.code });
    return failed(result.error?.code === "23505" ? "That category URL is already in use." : "Could not save the category.");
  }
  refresh(siteId);
  return ok("Category saved.");
}

export async function deleteBlogCategory(siteId: string, categoryId: string, moveTo: string | null): Promise<ActionResult> {
  const input = z.object({ siteId: uuid, categoryId: uuid, moveTo: uuid.nullable() }).safeParse({ siteId, categoryId, moveTo });
  if (!input.success || moveTo === categoryId) return failed("Choose a different destination category.");
  const { supabase } = await requireUser();
  if (moveTo) {
    const target = await supabase.from("post_categories").select("id").eq("site_id", siteId).eq("id", moveTo).maybeSingle();
    if (target.error || !target.data) return failed("Choose a destination category from this site.");
  }
  const { error: postsError } = await supabase.from("posts").update({ category_id: moveTo })
    .eq("site_id", siteId).eq("category_id", categoryId);
  if (postsError) return failed("Could not move posts from this category.");
  const { data, error } = await supabase.from("post_categories").delete().eq("site_id", siteId).eq("id", categoryId).select("id");
  if (error || !data?.length) return failed("Could not delete this category.");
  refresh(siteId);
  return ok("Category deleted.");
}

export async function saveBlogAuthor(siteId: string, authorId: string | null, raw: unknown): Promise<ActionResult> {
  const input = z.strictObject({
    name: z.string().trim().min(1).max(120), bio: z.string().trim().max(2000),
    photo: z.string().max(2048).refine((value) => value === "" || /^https:\/\//i.test(value), "Use a secure author photo URL."),
  }).safeParse(raw);
  if (!uuid.safeParse(siteId).success || (authorId !== null && !uuid.safeParse(authorId).success) || !input.success)
    return failed("Enter a valid author name, biography and photo.");
  const { supabase } = await requireUser();
  const values = input.data;
  const result = authorId
    ? await supabase.from("blog_authors").update(values).eq("site_id", siteId).eq("id", authorId).select("id")
    : await supabase.from("blog_authors").insert({ ...values, site_id: siteId }).select("id");
  if (result.error || !result.data?.length) return failed("Could not save this author.");
  refresh(siteId);
  return ok("Author saved.");
}

export async function deleteBlogAuthor(siteId: string, authorId: string): Promise<ActionResult> {
  if (!uuid.safeParse(siteId).success || !uuid.safeParse(authorId).success) return failed("Invalid author.");
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("blog_authors").delete().eq("site_id", siteId).eq("id", authorId).select("id");
  if (error || !data?.length) return failed("Could not delete this author.");
  refresh(siteId);
  return ok("Author deleted.");
}

export async function createBlogTag(siteId: string, rawName: string): Promise<ActionResult> {
  const name = z.string().trim().min(1).max(80).safeParse(rawName);
  if (!uuid.safeParse(siteId).success || !name.success) return failed("Enter a tag name.");
  const { supabase } = await requireUser();
  const slug = slugifyLabel(name.data);
  const { data, error } = await supabase.from("post_tags")
    .upsert({ site_id: siteId, name: name.data, slug }, { onConflict: "site_id,slug" }).select("id").single();
  if (error || !data) return failed("Could not create this tag.");
  refresh(siteId);
  return { status: "success", message: "Tag ready.", tagId: data.id as string };
}

export async function saveBlogImageAltText(siteId: string, postId: string, raw: unknown): Promise<ActionResult> {
  const input = z.discriminatedUnion("location", [
    z.strictObject({ location: z.literal("cover"), alt: z.string().trim().max(500) }),
    z.strictObject({ location: z.literal("thumbnail"), alt: z.string().trim().max(500) }),
    z.strictObject({ location: z.literal("block"), blockIndex: z.number().int().min(0).max(499), alt: z.string().trim().max(500) }),
    z.strictObject({
      location: z.literal("gallery"), blockIndex: z.number().int().min(0).max(499),
      imageIndex: z.number().int().min(0).max(19), alt: z.string().trim().max(500),
    }),
  ]).safeParse(raw);
  if (!uuid.safeParse(siteId).success || !uuid.safeParse(postId).success || !input.success)
    return failed("Invalid image alt text.");
  const { supabase } = await requireUser();
  const { data: post, error: loadError } = await supabase.from("posts")
    .select("id, site_id, status, has_unpublished_changes, draft_content")
    .eq("site_id", siteId).eq("id", postId).maybeSingle();
  if (loadError || !post) return failed("This post is unavailable.");
  const update: Record<string, unknown> = {
    has_unpublished_changes: post.status === "published" ? true : post.has_unpublished_changes,
  };
  if (input.data.location === "cover") update.cover_alt = input.data.alt;
  else if (input.data.location === "thumbnail") update.thumbnail_alt = input.data.alt;
  else {
    let content;
    try { content = blogContentSchema.parse(post.draft_content); }
    catch { return failed("This post has invalid draft content."); }
    const block = content.blocks[input.data.blockIndex];
    if (input.data.location === "block") {
      if (block?.type !== "image") return failed("This image is no longer available.");
      content.blocks[input.data.blockIndex] = { ...block, alt: input.data.alt };
    } else {
      if (block?.type !== "gallery" || !block.images[input.data.imageIndex]) return failed("This image is no longer available.");
      block.images[input.data.imageIndex] = { ...block.images[input.data.imageIndex], alt: input.data.alt };
    }
    update.draft_content = sanitizeBlogContent(content);
  }
  const { error } = await supabase.from("posts").update(update).eq("id", postId).eq("site_id", siteId);
  if (error) {
    console.error("Could not save blog image alt text", { code: error.code });
    return failed("Could not save this image description.");
  }
  refresh(siteId);
  return ok("Alt text saved.");
}

export async function saveBlogSettings(siteId: string, raw: unknown): Promise<ActionResult> {
  const input = z.strictObject({
    timezone: z.string().trim().min(1).max(64),
    blog_path: z.string().trim().min(1).max(200),
    posts_per_page: z.number().int().min(1).max(100),
    index_layout: z.enum(["grid", "list", "magazine"]),
    default_post_layout: z.enum(["classic", "wide", "minimal"]),
    show_author: z.boolean(), show_date: z.boolean(), show_reading_time: z.boolean(), show_share_links: z.boolean(),
    show_in_menu: z.boolean(), noindex_tags: z.boolean(),
    cta_text: z.string().max(300), cta_button_text: z.string().max(80),
    cta_link: z.string().max(2048),
  }).safeParse(raw);
  if (!uuid.safeParse(siteId).success || !input.success) return failed("Some blog settings are invalid.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.data.timezone });
  } catch {
    return failed("Choose a valid timezone.");
  }
  if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)+$/.test(input.data.blog_path) || input.data.blog_path.includes("//"))
    return failed("Blog path must use lowercase letters, numbers and dashes.");
  const { supabase } = await requireUser();
  const { cta_link, ...settings } = input.data;
  settings.blog_path = settings.blog_path.replace(/\/+$/, "");
  const link = cta_link.trim();
  const cta = link && (/^(https?:\/\/|mailto:|tel:)/i.test(link) || (/^\/(?!\/)/.test(link))) ? link : "";
  if (link && !cta) return failed("Enter a safe CTA link.");
  const [siteResult, settingsResult] = await Promise.all([
    supabase.rpc("update_blog_site_timezone", { p_site_id: siteId, p_timezone: input.data.timezone }),
    supabase.from("blog_settings").upsert({ site_id: siteId, ...settings, cta_link: cta }).select("site_id"),
  ]);
  if (siteResult.error || settingsResult.error || !settingsResult.data?.length) {
    console.error("Could not save blog settings", { site: siteResult.error?.code, settings: settingsResult.error?.code });
    return failed("Could not save blog settings.");
  }
  refresh(siteId);
  return ok("Blog settings saved.");
}

export async function listBlogPostVersions(postId: string) {
  if (!uuid.safeParse(postId).success) throw new Error("Invalid post ID.");
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("post_versions").select("id, created_at")
    .eq("post_id", postId).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error("Could not load post revisions.", { cause: error });
  return data ?? [];
}

export async function restoreBlogPostVersion(postId: string, versionId: string): Promise<ActionResult> {
  const parsed = z.object({ postId: uuid, versionId: uuid }).safeParse({ postId, versionId });
  if (!parsed.success) return failed("Invalid post revision.");
  const { supabase } = await requireUser();
  const { data: version, error: versionError } = await supabase.from("post_versions").select("draft_content")
    .eq("post_id", parsed.data.postId).eq("id", parsed.data.versionId).maybeSingle();
  if (versionError || !version) return failed("This revision is unavailable.");
  const content = sanitizeBlogContent(blogContentSchema.parse(version.draft_content));
  const { data, error } = await supabase.from("posts").update({ draft_content: content })
    .eq("id", parsed.data.postId).select("site_id");
  if (error || !data?.length) return failed("Could not restore this revision.");
  refresh(data[0].site_id);
  return { status: "success", message: "Revision restored to draft.", content };
}
