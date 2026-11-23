import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { blogBlockSchema } from "@/lib/blog";
import { RESERVED_PAGE_SLUGS } from "@/lib/page-slugs";
import { customSectionSchema } from "./custom-layout";

const jsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonValues: z.ZodType[] = [jsonScalar];
for (let depth = 1; depth <= 5; depth++) {
  const child = jsonValues[depth - 1];
  jsonValues.push(z.union([
    jsonScalar,
    z.array(child).max(80),
    z.record(z.string(), child),
  ]));
}
const jsonObject = z.record(z.string(), jsonValues[5]);
const sectionRef = z.object({ pageId: z.uuid(), sectionId: z.string().min(1).max(200) });
// The same rules as the Pages panel and the database, so staged page settings can always be applied.
const navLabel = z.string().trim().min(1).max(40).regex(/^\S+( \S+){0,2}$/, "Use at most three words for a menu label.");
const pageSlug = z.string().trim().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((slug) => !RESERVED_PAGE_SLUGS.has(slug), "That page address is reserved. Choose another.");

const pageSections = z.array(z.object({
  designId: z.string().min(1).max(100).optional(),
  customSection: customSectionSchema.optional(),
  props: jsonObject.optional(),
}));
const BLOG_BLOCKS = "Write the post as blocks: paragraph (html with p, strong, em and a tags), heading (level 2 to 4), list, quote, callout, divider or table. Images and videos cannot be added.";
const blogBlocks = z.array(blogBlockSchema).min(1).max(200);
const CUSTOM_LAYOUT = "A custom layout is rows of columns of elements. Text elements take plain text with blank lines between paragraphs and optional **bold** or *emphasis*. An Image element's query is only a search hint: the image is inserted empty, then chosen with set_image. Gaps and spacing are numbers from this scale: 0, 4, 8, 12, 16, 24, 32, 48, 64, 80, 96, 128.";

const specs = [
  { name: "get_site_overview", description: "Read a compact map of pages, theme, header, footer, business, blog, and SEO.", schema: z.object({}) },
  { name: "get_page", description: "Read one page's complete validated sections.", schema: z.object({ pageId: z.uuid() }) },
  { name: "search_site", description: "Search text across pages and blog posts.", schema: z.object({ query: z.string().trim().min(1).max(200) }) },
  { name: "list_section_designs", description: "List curated section designs. With a blockType, also returns that block's editable props.", schema: z.object({ blockType: z.string().max(80).optional() }) },
  { name: "get_blog_posts", description: "List blog draft and published post summaries.", schema: z.object({
    query: z.string().max(200).optional(), status: z.enum(["draft", "scheduled", "published", "all"]).default("all"),
    limit: z.number().int().min(1).max(30).default(10),
  }) },
  { name: "get_post", description: "Read a blog post draft by ID.", schema: z.object({ postId: z.uuid() }) },
  { name: "plan", description: "Present an ordered plan and wait for approval before broad changes.", schema: z.object({
    steps: z.array(z.string().trim().min(1).max(240)).min(1).max(12), rationale: z.string().max(1000).optional(),
  }) },
  { name: "ask_user", description: "Ask one genuinely ambiguous question and optionally provide choices.", schema: z.object({
    question: z.string().trim().min(1).max(1000), options: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
  }) },
  { name: "update_theme", description: "Stage site theme changes. Send only what changes: style, headingFont, bodyFont, radius, buttonStyle, colors (primary, secondary, accent, background, text as hex). Text is kept contrast-safe.", schema: z.object({ patch: jsonObject }) },
  { name: "update_header", description: "Stage global header settings. Send only the settings to change; they are merged into the current header.", schema: z.object({ header: jsonObject }) },
  { name: "update_footer", description: "Stage shared footer props. Send only the props to change. Phone, email, address and hours come from Business information and cannot be changed.", schema: z.object({ props: jsonObject }) },
  { name: "update_section_props", description: "Stage content changes to a section or a nested layout element (use its id as sectionId). Send only the props to change; a list prop is replaced whole. Images are changed with set_image, design with update_section_design.", schema: sectionRef.extend({ props: jsonObject }) },
  { name: "update_section_design", description: "Stage design changes (background, spacing, appearance, border, shadow, animation) to a section or a nested layout element.", schema: sectionRef.extend({ design: jsonObject }) },
  { name: "switch_section_design", description: "Switch a section to a curated design while preserving compatible content.", schema: sectionRef.extend({
    designId: z.string().min(1).max(100),
  }) },
  { name: "insert_section", description: `Insert a section into a page: either a curated designId (optionally with props for its content) or a customSection. ${CUSTOM_LAYOUT}`, schema: z.object({
    pageId: z.uuid(), designId: z.string().min(1).max(100).optional(), customSection: customSectionSchema.optional(),
    position: z.number().int().min(0).optional(), props: jsonObject.optional(),
  }) },
  { name: "move_section", description: "Move a section to a zero-based position on its page.", schema: sectionRef.extend({
    position: z.number().int().min(0),
  }) },
  { name: "duplicate_section", description: "Duplicate a section on its page.", schema: sectionRef.extend({
    position: z.number().int().min(0).optional(),
  }) },
  { name: "delete_section", description: "Remove a section from a page.", schema: sectionRef },
  { name: "create_page", description: "Stage a new page. Each section is a curated designId (optionally with props for its content) or a customSection as in insert_section. The shared footer is added automatically.", schema: z.object({
    title: z.string().trim().min(1).max(200),
    slug: pageSlug,
    navLabel,
    sections: pageSections.max(20),
  }) },
  { name: "update_page_settings", description: "Stage page title, navigation, SEO, and visibility settings.", schema: z.object({
    pageId: z.uuid(), title: z.string().trim().min(1).max(200).optional(), navLabel: navLabel.optional(),
    seoTitle: z.string().max(200).optional(), seoDescription: z.string().max(500).optional(), hidden: z.boolean().optional(),
  }) },
  { name: "set_image", description: "Search stock photos, save one to site assets, and stage it into an image field of a section or nested element. field is the image prop path, such as backgroundImage, services.0.image, or src for an Image element.", schema: sectionRef.extend({
    query: z.string().trim().min(1).max(100), field: z.string().min(1).max(120), alt: z.string().max(500).optional(),
  }) },
  { name: "create_blog_post_draft", description: `Stage a new unpublished blog post draft. ${BLOG_BLOCKS}`, schema: z.object({
    title: z.string().trim().min(1).max(200), subtitle: z.string().max(300).default(""),
    excerpt: z.string().max(500).default(""), slug: z.string().trim().min(1).max(1000),
    blocks: blogBlocks, seoTitle: z.string().max(200).default(""), seoDescription: z.string().max(500).default(""),
  }) },
  { name: "update_blog_post_draft", description: "Stage changes to an existing unpublished blog post draft. Send only the fields to change; blocks replaces the whole post body, so keep the blocks you do not change, including images, exactly as get_post returned them.", schema: z.strictObject({
    postId: z.uuid(), title: z.string().trim().min(1).max(200).optional(), subtitle: z.string().max(300).optional(),
    excerpt: z.string().max(500).optional(), slug: z.string().trim().min(1).max(1000).optional(),
    blocks: blogBlocks.optional(), seoTitle: z.string().max(200).optional(), seoDescription: z.string().max(500).optional(),
    coverAlt: z.string().max(500).optional(),
  }) },
] as const;

export const agentToolRegistry = specs.map((spec) => ({
  ...spec,
  write: ![
    "get_site_overview", "get_page", "search_site", "list_section_designs", "get_blog_posts", "get_post", "plan", "ask_user",
  ].includes(spec.name),
}));

export const agentToolSchemas = new Map<string, z.ZodType>(agentToolRegistry.map(({ name, schema }) => [name, schema]));

export const agentTools: Anthropic.Tool[] = agentToolRegistry.map(({ name, description, schema }) => {
  const { $schema: dialect, ...input_schema } = z.toJSONSchema(schema, { io: "input", reused: "ref" });
  void dialect;
  return { name, description, strict: false, input_schema: { ...input_schema, type: "object" } };
});
