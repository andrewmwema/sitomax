import DOMPurify from "isomorphic-dompurify";
import { SaxesParser } from "saxes";
import { blogSlugSchema, sanitizeBlogContent, type BlogBlock } from "@/lib/blog";

export const IMPORT_BYTES = 2 * 1024 * 1024;
export const IMPORT_BATCH = 5;

type XmlNode = { name: string; attributes: Record<string, string>; parts: (string | XmlNode)[] };
type Image = Extract<BlogBlock, { type: "image" }>;
export type ImportedPost = {
  title: string; slug: string; excerpt: string; author: string; category: string; tags: string[];
  published: boolean; date: string | null; cover?: Image; blocks: BlogBlock[];
};
export type ImportEntry = { title: string; post: ImportedPost } | { title: string; error: string };

function readXml(xml: string) {
  const root: XmlNode = { name: "", attributes: {}, parts: [] };
  const stack = [root];
  const parser = new SaxesParser({ xmlns: true });
  let count = 0;
  parser.on("doctype", () => { throw new Error("XML document types are not supported."); });
  parser.on("opentag", (tag) => {
    if (++count > 40_000 || stack.length > 64) throw new Error("The XML export is too complex.");
    const namespace = /^https?:\/\/wordpress\.org\/export\/[^/]+\/excerpt\/$/.test(tag.uri) ? "excerpt" :
      /^https?:\/\/wordpress\.org\/export\//.test(tag.uri) ? "wp" :
      tag.uri === "http://purl.org/rss/1.0/modules/content/" ? "content" :
      tag.uri === "http://purl.org/dc/elements/1.1/" ? "dc" :
      tag.uri === "http://search.yahoo.com/mrss/" ? "media" : "";
    const node: XmlNode = {
      name: namespace ? `${namespace}:${tag.local}` : tag.local,
      attributes: Object.fromEntries(Object.values(tag.attributes).map((attr) => [attr.name, attr.value])),
      parts: [],
    };
    stack.at(-1)!.parts.push(node);
    stack.push(node);
  });
  const append = (value: string) => stack.at(-1)!.parts.push(value);
  parser.on("text", append);
  parser.on("cdata", append);
  parser.on("closetag", () => { stack.pop(); });
  try { parser.write(xml).close(); }
  catch (error) { throw new Error("Invalid or unsupported XML. Use an RSS, Atom, or WordPress export without a document type.", { cause: error }); }
  return root;
}

const children = (node: XmlNode, name: string) => node.parts.filter((part): part is XmlNode => typeof part !== "string" && part.name === name);
const first = (node: XmlNode, name: string) => children(node, name)[0];
const text = (node?: XmlNode): string => node?.parts.map((part) => typeof part === "string" ? part : text(part)).join("").trim() ?? "";
const value = (node: XmlNode, name: string) => text(first(node, name));
const xmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const xmlMarkup = (node: XmlNode): string => node.parts.map((part) => typeof part === "string" ? xmlEscape(part) :
  `<${part.name}${Object.entries(part.attributes).map(([name, val]) => ` ${name}="${xmlEscape(val)}"`).join("")}>${xmlMarkup(part)}</${part.name}>`).join("");
const markup = (node?: XmlNode): string => node?.parts.some((part) => typeof part !== "string") ? xmlMarkup(node) : text(node);

function webUrl(raw: string, base?: string) {
  try {
    const url = new URL(raw, base);
    return raw && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.href.length <= 2048 ? url.href : "";
  } catch { return ""; }
}

function htmlDocument(html: string) {
  return DOMPurify.sanitize(html, {
    RETURN_DOM: true, ALLOWED_TAGS: ["p", "div", "section", "article", "figure", "figcaption", "img",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "hr", "br",
      "table", "thead", "tbody", "tr", "th", "td", "a", "strong", "em", "b", "i", "u", "s", "span"],
    ALLOWED_ATTR: ["href", "src", "alt"], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  }) as HTMLElement;
}

function plain(html: string, max: number) {
  return (htmlDocument(html).textContent ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function importHtml(html: string, base?: string): BlogBlock[] {
  const document = htmlDocument(html);
  for (const link of document.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") ?? "";
    if (!/^(#|mailto:|tel:)/i.test(href)) link.setAttribute("href", webUrl(href, base));
  }
  const blocks: BlogBlock[] = [];
  function walk(nodes: NodeListOf<ChildNode>) {
    let inline = "";
    const flush = () => {
      if (inline.trim()) blocks.push({ type: "paragraph", html: `<p>${inline.slice(0, 19993)}</p>` });
      inline = "";
    };
    for (const node of nodes) {
      if (blocks.length >= 500) return;
      if (node.nodeType === 3) { inline += xmlEscape(node.textContent ?? ""); continue; }
      if (!(node.nodeType === 1 && "tagName" in node)) continue;
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      const content = el.textContent?.trim() ?? "";
      if (tag === "img") {
        flush();
        const url = webUrl(el.getAttribute("src") ?? "", base).replace(/^http:/, "https:");
        if (url) blocks.push({ type: "image", url, alt: (el.getAttribute("alt") ?? "").slice(0, 500),
          caption: (el.closest("figure")?.querySelector("figcaption")?.textContent ?? "").trim().slice(0, 500) });
      } else if (tag === "figcaption") continue;
      else if (/^h[1-6]$/.test(tag)) {
        flush();
        const level = Number(tag[1]);
        if (content) blocks.push({ type: "heading", level: level <= 2 ? 2 : level === 3 ? 3 : 4, text: content.slice(0, 1000) });
      } else if (tag === "blockquote" || tag === "hr") {
        flush();
        if (tag === "hr") blocks.push({ type: "divider" });
        else if (content) blocks.push({ type: "quote", text: content.slice(0, 5000), attribution: "" });
      } else if (tag === "ol" || tag === "ul") {
        flush();
        const items = [...el.querySelectorAll(":scope > li")].slice(0, 100).map((li) => (li.textContent ?? "").trim().slice(0, 2000)).filter(Boolean);
        if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items });
      } else if (tag === "table") {
        flush();
        const rows = [...el.querySelectorAll("tr")].slice(0, 30).map((tr) =>
          [...tr.children].slice(0, 8).map((cell) => (cell.textContent ?? "").trim().slice(0, 500))).filter((row) => row.length);
        if (rows.length) blocks.push({ type: "table", rows });
      } else if (["p", "div", "section", "article", "figure"].includes(tag) || el.querySelector("img")) {
        flush();
        walk(el.childNodes);
      } else inline += el.outerHTML;
    }
    if (blocks.length < 500) flush();
  }
  walk(document.childNodes);
  return sanitizeBlogContent({ version: 1, blocks: blocks.slice(0, 500) }).blocks;
}

export function parseBlogImport(xml: string, blogPath: string, sourceUrl?: string): ImportEntry[] {
  if (new TextEncoder().encode(xml).length > IMPORT_BYTES) throw new Error("The XML source exceeds 2 MB.");
  const doc = readXml(xml);
  const channel = first(first(doc, "rss") ?? doc, "channel");
  const feed = first(doc, "feed");
  if (!channel && !feed) throw new Error("Choose a WordPress, RSS, or Atom export.");
  const wordpress = Boolean(channel && value(channel, "wp:wxr_version"));
  const items = feed ? children(feed, "entry") : children(channel!, "item");
  const attachments = new Map(items.filter((item) => value(item, "wp:post_type") === "attachment")
    .map((item) => [value(item, "wp:post_id"), {
      href: value(item, "wp:attachment_url"),
      alt: text(first(children(item, "wp:postmeta").find((node) => value(node, "wp:meta_key") === "_wp_attachment_image_alt") ?? item, "wp:meta_value")),
    }]));
  const authors = new Map((channel ? children(channel, "wp:author") : []).map((author) =>
    [value(author, "wp:author_login"), value(author, "wp:author_display_name")]));
  const channelUrl = webUrl(channel ? value(channel, "link") : "", sourceUrl) || sourceUrl;
  const posts = wordpress ? items.filter((item) => value(item, "wp:post_type") === "post") : items;
  if (!posts.length) throw new Error("No blog posts were found in this source.");
  if (posts.length > 250) throw new Error("This source exceeds 250 posts. Export a smaller date range and try again.");
  return posts.map((item) => {
    const title = plain(value(item, "title"), 200) || "Untitled post";
    const link = webUrl(feed ? children(item, "link").find((node) => !node.attributes.rel || node.attributes.rel === "alternate")?.attributes.href ?? "" :
      value(item, "link"), channelUrl);
    const path = link ? new URL(link).pathname : "";
    const root = blogPath.replace(/\/+$/, "");
    const originalSlug = (path.startsWith(`${root}/`) ? path.slice(root.length) : path).replace(/^\/+|\/+$/g, "")
      || value(item, "wp:post_name");
    const slug = blogSlugSchema.safeParse(originalSlug);
    if (!slug.success) return { title, error: "The original slug is missing or is not supported on this site." };
    const raw = markup(first(item, "content:encoded") ?? first(item, "content") ?? first(item, "description") ?? first(item, "summary"));
    const blocks = importHtml(raw, link || channelUrl);
    const taxonomy = children(item, "category");
    const tags = [...new Set(taxonomy.filter((node) => !wordpress || node.attributes.domain === "post_tag")
      .map((node) => plain(node.attributes.term || text(node), 80)).filter(Boolean))].slice(0, 50);
    const categoryNode = wordpress ? taxonomy.find((node) => node.attributes.domain === "category") : taxonomy[0];
    const category = plain(categoryNode?.attributes.term || text(categoryNode), 100);
    const creator = value(item, "dc:creator") || text(first(first(item, "author") ?? item, "name")) || value(item, "author");
    const author = plain(authors.get(creator) || creator, 120);
    const thumbnail = children(item, "wp:postmeta").find((node) => value(node, "wp:meta_key") === "_thumbnail_id");
    const enclosure = children(item, "enclosure").find((node) => node.attributes.type?.startsWith("image/"));
    const attachment = thumbnail && attachments.get(value(thumbnail, "wp:meta_value"));
    const imageHref = attachment?.href || first(item, "media:thumbnail")?.attributes.url ||
      children(item, "media:content").find((node) => node.attributes.medium === "image" || node.attributes.type?.startsWith("image/"))?.attributes.url || enclosure?.attributes.url ||
      children(item, "link").find((node) => node.attributes.rel === "enclosure" && node.attributes.type?.startsWith("image/"))?.attributes.href || "";
    const coverUrl = webUrl(imageHref, link || channelUrl).replace(/^http:/, "https:");
    const dateGmt = value(item, "wp:post_date_gmt");
    const dateString = (dateGmt && !dateGmt.startsWith("0000") ? `${dateGmt.replace(" ", "T")}Z` : "") ||
      value(item, "pubDate") || value(item, "published") || value(item, "updated");
    const time = Date.parse(dateString);
    const cover = coverUrl ? { type: "image" as const, url: coverUrl, alt: attachment?.alt.slice(0, 500) ?? "", caption: "" } :
      blocks.find((block): block is Image => block.type === "image");
    return { title, post: { title, slug: slug.data, author, category, tags, blocks, cover,
      excerpt: plain(markup(first(item, "excerpt:encoded") ?? first(item, "summary") ?? first(item, "description")) || raw, 500),
      published: !wordpress || value(item, "wp:status") === "publish",
      date: Number.isFinite(time) ? new Date(time).toISOString() : null,
    } };
  });
}
