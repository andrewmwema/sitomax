import { describe, expect, it } from "vitest";
import {
  blogContentSchema, blogPostFieldsSchema, blogPublicationSnapshot, blogSlugSchema, blogSlugify, readingMinutes, sanitizeBlogContent,
  weakAltText,
} from "./blog";

describe("blog slugs", () => {
  it("supports nested lower-case post paths", () => {
    expect(blogSlugSchema.safeParse("seo-basics/meta-tags").success).toBe(true);
    expect(blogSlugify("SEO Basics/Meta Tags")).toBe("seo-basics/meta-tags");
    expect(blogSlugSchema.safeParse("seo//meta").success).toBe(false);
    expect(blogSlugSchema.safeParse("../admin").success).toBe(false);
  });
});

describe("blog content", () => {
  it("accepts supported blocks and sanitizes paragraph HTML", () => {
    const clean = sanitizeBlogContent({
      version: 1,
      blocks: [
        { type: "paragraph", html: '<p>Hello <strong>there</strong><script>alert(1)</script><a href="javascript:alert(1)">bad</a></p>' },
        { type: "heading", level: 2, text: "Details" },
      ],
    });
    expect(clean.blocks[0]).toMatchObject({
      type: "paragraph",
      html: '<p>Hello <strong>there</strong><a rel="noopener noreferrer">bad</a></p>',
    });
    expect(blogContentSchema.safeParse({ version: 1, blocks: [{ type: "heading", level: 1, text: "Bad" }] }).success).toBe(false);
    expect(blogContentSchema.safeParse({ version: 1, blocks: [{ type: "video", url: "https://example.com/video", title: "" }] }).success).toBe(false);
  });

  it("estimates reading time from the submitted blocks", () => {
    const text = Array.from({ length: 441 }, () => "word").join(" ");
    expect(readingMinutes({ version: 1, blocks: [{ type: "paragraph", html: `<p>${text}</p>` }] })).toBe(3);
    expect(readingMinutes({ version: 1, blocks: [] })).toBe(1);
  });

  it("flags missing, generic and filename-only image descriptions", () => {
    expect(weakAltText("")).toBe(true);
    expect(weakAltText("image 2")).toBe(true);
    expect(weakAltText("photo_2025.jpg")).toBe(true);
    expect(weakAltText("A family gathered around a dinner table")).toBe(false);
  });

  it("keeps the published body and metadata together as a versioned snapshot", () => {
    const fields = blogPostFieldsSchema.parse({
      title: "Current title", subtitle: "Subtitle", slug: "current-title", excerpt: "Summary",
      draft_content: { version: 1, blocks: [{ type: "heading", level: 2, text: "Draft body" }] },
      cover_image: "", cover_alt: "", thumbnail_image: "", thumbnail_alt: "",
      author_id: null, category_id: null, tag_ids: [], featured: false, layout_override: null,
      seo_title: "", seo_description: "", canonical_url: "", noindex: false,
    });
    const content = sanitizeBlogContent(fields.draft_content);
    const snapshot = blogPublicationSnapshot(fields, content, null, null, ["Guides"], 1);
    expect(snapshot).toMatchObject({
      version: 1,
      blocks: [{ type: "heading", text: "Draft body" }],
      metadata: { title: "Current title", slug: "current-title", tags: ["Guides"], reading_minutes: 1 },
    });
  });
});
