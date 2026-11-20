import { z } from "zod";
import { sanitizeRichText } from "@/lib/richtext";
import { slugify } from "@/lib/page-slugs";
import { safeMediaUrl, videoEmbedUrl } from "@/lib/sections/design";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export const blogSlugSchema = z.string().trim().min(1).max(1000).regex(slugPattern, {
  message: "Use lowercase letters, numbers and dashes; nested paths may use /.",
}).refine((value) => !["category", "tag", "author"].includes(value.split("/")[0]), {
  message: "Post slugs cannot begin with category, tag, or author.",
});

export function blogSlugify(value: string): string {
  const slug = value.split("/").map((part) => slugify(part)).filter(Boolean).join("/");
  return slug.slice(0, 1000).replace(/\/+$/, "");
}

export function weakAltText(value: string): boolean {
  const alt = value.trim().toLowerCase().replace(/\s+/g, " ");
  return !alt || alt.length < 4 || /^(image|photo|picture|graphic|screenshot|img|untitled)(\s*\d*)?$/.test(alt) ||
    /\.(?:jpe?g|png|gif|webp|avif|svg)$/i.test(alt);
}

const safeLink = (value: string) => {
  if (value.length > 2048 || value !== value.trim() || /[\s\\]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value) || value === "#") return true;
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};

const paragraph = z.strictObject({ type: z.literal("paragraph"), html: z.string().max(20000) });
const heading = z.strictObject({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), text: z.string().max(1000) });
const list = z.strictObject({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.string().max(2000)).max(100) });
const quote = z.strictObject({ type: z.literal("quote"), text: z.string().max(5000), attribution: z.string().max(300) });
const callout = z.strictObject({ type: z.literal("callout"), title: z.string().max(300), text: z.string().max(5000) });
const imageUrl = z.string().max(2048).refine((value) => value === "" || safeMediaUrl(value) !== null, "Use a secure image URL.");
const image = z.strictObject({ type: z.literal("image"), url: imageUrl, alt: z.string().max(500), caption: z.string().max(500) });
const gallery = z.strictObject({
  type: z.literal("gallery"),
  images: z.array(z.strictObject({ url: imageUrl, alt: z.string().max(500), caption: z.string().max(300) })).min(1).max(20),
});
const video = z.strictObject({ type: z.literal("video"), url: z.string().max(500).refine((url) => videoEmbedUrl(url) !== null, "Use a supported video URL."), title: z.string().max(200) });
const button = z.strictObject({
  type: z.literal("button"), text: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(2048).refine(safeLink, "Choose a safe link."),
});
const divider = z.strictObject({ type: z.literal("divider") });
const table = z.strictObject({ type: z.literal("table"), rows: z.array(z.array(z.string().max(500)).min(1).max(8)).min(1).max(30) });

export const blogBlockSchema = z.discriminatedUnion("type", [
  paragraph, heading, list, quote, callout, image, gallery, video, button, divider, table,
]);

export const blogContentSchema = z.strictObject({
  version: z.literal(1),
  blocks: z.array(blogBlockSchema).max(500),
});
export type BlogContent = z.infer<typeof blogContentSchema>;
export type BlogBlock = z.infer<typeof blogBlockSchema>;

const safeImageField = z.string().max(2048).refine((value) => value === "" || safeMediaUrl(value) !== null, "Use a secure image URL.");
const canonicalUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}, "Enter a valid canonical URL.");

export function sanitizeBlogContent(raw: unknown): BlogContent {
  const parsed = blogContentSchema.parse(raw);
  return {
    version: 1,
    blocks: parsed.blocks.map((block) => block.type === "paragraph"
      ? { ...block, html: sanitizeRichText(block.html) }
      : block),
  };
}

export function readingMinutes(content: BlogContent): number {
  const words = content.blocks.map((block) => {
    switch (block.type) {
      case "paragraph": return block.html.replace(/<[^>]*>/g, " ");
      case "heading": return block.text;
      case "list": return block.items.join(" ");
      case "quote": return `${block.text} ${block.attribution}`;
      case "callout": return `${block.title} ${block.text}`;
      case "image": return `${block.alt} ${block.caption}`;
      case "gallery": return block.images.map(({ alt, caption }) => `${alt} ${caption}`).join(" ");
      case "video": return block.title;
      case "button": return block.text;
      case "divider": return "";
      case "table": return block.rows.flat().join(" ");
    }
  }).join(" ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export const blogPostFieldsSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300),
  slug: blogSlugSchema,
  excerpt: z.string().trim().max(500),
  draft_content: blogContentSchema,
  cover_image: safeImageField,
  cover_alt: z.string().max(500),
  thumbnail_image: safeImageField,
  thumbnail_alt: z.string().max(500),
  author_id: z.uuid().nullable(),
  category_id: z.uuid().nullable(),
  tag_ids: z.array(z.uuid()).max(50),
  featured: z.boolean(),
  layout_override: z.enum(["classic", "wide", "minimal"]).nullable(),
  seo_title: z.string().trim().max(200),
  seo_description: z.string().trim().max(500),
  canonical_url: canonicalUrl,
  noindex: z.boolean(),
});

export type BlogPostFields = z.infer<typeof blogPostFieldsSchema>;

export const blogPublicationSchema = z.strictObject({
  version: z.literal(1),
  blocks: blogContentSchema.shape.blocks,
  metadata: z.strictObject({
    title: z.string().max(200), subtitle: z.string().max(300), slug: blogSlugSchema,
    excerpt: z.string().max(500), cover_image: safeImageField, cover_alt: z.string().max(500),
    thumbnail_image: safeImageField, thumbnail_alt: z.string().max(500),
    author: z.strictObject({ name: z.string().max(120), bio: z.string().max(2000), photo: safeImageField }).nullable(),
    category: z.strictObject({ name: z.string().max(100), slug: z.string().max(200) }).nullable(),
    tags: z.array(z.union([
      z.string().max(80),
      z.strictObject({ name: z.string().max(80), slug: z.string().max(160) }),
    ])).max(50),
    featured: z.boolean(), layout_override: z.enum(["classic", "wide", "minimal"]).nullable(),
    seo_title: z.string().max(200), seo_description: z.string().max(500),
    canonical_url: canonicalUrl, noindex: z.boolean(), reading_minutes: z.number().int().min(1).max(999),
  }),
});
export type BlogPublication = z.infer<typeof blogPublicationSchema>;

export function blogPublicationSnapshot(
  post: BlogPostFields,
  content: BlogContent,
  author: BlogPublication["metadata"]["author"],
  category: BlogPublication["metadata"]["category"],
  tags: { name: string; slug: string }[],
  minutes: number,
): BlogPublication {
  return blogPublicationSchema.parse({
    version: 1,
    blocks: content.blocks,
    metadata: {
      title: post.title, subtitle: post.subtitle, slug: post.slug, excerpt: post.excerpt,
      cover_image: post.cover_image, cover_alt: post.cover_alt,
      thumbnail_image: post.thumbnail_image, thumbnail_alt: post.thumbnail_alt,
      author, category, tags, featured: post.featured, layout_override: post.layout_override,
      seo_title: post.seo_title, seo_description: post.seo_description, canonical_url: post.canonical_url,
      noindex: post.noindex, reading_minutes: minutes,
    },
  });
}
