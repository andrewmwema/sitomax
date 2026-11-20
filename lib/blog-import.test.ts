import { describe, expect, it } from "vitest";
import { parseBlogImport } from "./blog-import";

describe("blog import mapping", () => {
  it("preserves nested WXR slugs, maps author, taxonomy, featured images and dates, and sanitizes HTML", () => {
    const entries = parseBlogImport(`<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/"
      xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
      xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel><link>https://old.example</link><wp:wxr_version>1.2</wp:wxr_version>
      <wp:author><wp:author_login>writer</wp:author_login><wp:author_display_name>Test Writer</wp:author_display_name></wp:author>
      <item><wp:post_type>attachment</wp:post_type><wp:post_id>5</wp:post_id>
      <wp:attachment_url>http://old.example/cover.png</wp:attachment_url>
      <wp:postmeta><wp:meta_key>_wp_attachment_image_alt</wp:meta_key><wp:meta_value>Blue flowers</wp:meta_value></wp:postmeta></item>
      <item><title>A &amp; B</title><link>https://old.example/blog/news/story/</link><dc:creator>writer</dc:creator>
      <wp:post_type>post</wp:post_type><wp:status>publish</wp:status><wp:post_date_gmt>2026-03-10 12:00:00</wp:post_date_gmt>
      <category domain="category">News</category><category domain="post_tag">Updates</category>
      <wp:postmeta><wp:meta_key>_thumbnail_id</wp:meta_key><wp:meta_value>5</wp:meta_value></wp:postmeta>
      <excerpt:encoded><![CDATA[<em>The excerpt.</em>]]></excerpt:encoded>
      <content:encoded><![CDATA[<h2>Heading</h2><p><strong>Hello</strong><script>bad()</script></p>
        <figure><img src="/photo.jpg" onerror="bad()"><figcaption>Caption</figcaption></figure><ul><li>One</li></ul>]]></content:encoded>
      </item></channel></rss>`, "/blog");
    expect(entries).toEqual([{ title: "A & B", post: {
      title: "A & B", slug: "news/story", author: "Test Writer", category: "News", tags: ["Updates"],
      excerpt: "The excerpt.", published: true, date: "2026-03-10T12:00:00.000Z",
      cover: { type: "image", url: "https://old.example/cover.png", alt: "Blue flowers", caption: "" },
      blocks: [
        { type: "heading", level: 2, text: "Heading" }, { type: "paragraph", html: "<p><strong>Hello</strong></p>" },
        { type: "image", url: "https://old.example/photo.jpg", alt: "", caption: "Caption" },
        { type: "list", ordered: false, items: ["One"] },
      ],
    } }]);
  });

  it("maps Atom XHTML and reports slugs that cannot be preserved rather than rewriting them", () => {
    expect(parseBlogImport(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Test</title><link href="/notes/test"/>
      <published>2026-04-04T00:00:00Z</published><author><name>Test Author</name></author><category term="Tips"/>
      <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>One &lt; two</p></div></content></entry>
      <entry><title>Missing link</title></entry></feed>`, "/notes", "https://example.test/feed.xml")).toMatchObject([
      { post: { slug: "test", author: "Test Author", category: "Tips", blocks: [{ type: "paragraph", html: "<p>One &lt; two</p>" }] } },
      { title: "Missing link", error: expect.stringContaining("slug") },
    ]);
  });

  it("rejects XML document type declarations", () => {
    expect(() => parseBlogImport(`<!DOCTYPE rss><rss><channel/></rss>`, "/blog")).toThrow("Invalid or unsupported XML");
  });
});
