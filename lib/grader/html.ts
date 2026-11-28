import DOMPurify from "isomorphic-dompurify";
import type { Category, Check, CheckStatus, GraderInput } from "./types";

type Definition = { id: string; category: Category; fix: string };
const definitions: Definition[] = [
  { id: "viewport", category: "mobile", fix: "Add a responsive viewport meta tag." },
  { id: "horizontal_overflow", category: "mobile", fix: "Review wide fixed-width elements on mobile." },
  { id: "title", category: "seo", fix: "Write a descriptive title between 30 and 60 characters." },
  { id: "description", category: "seo", fix: "Write a useful meta description between 70 and 160 characters." },
  { id: "h1", category: "seo", fix: "Use one clear H1 heading per page." },
  { id: "headings", category: "seo", fix: "Organize headings in a logical hierarchy." },
  { id: "image_alt", category: "seo", fix: "Add meaningful alt text or mark decorative images with empty alt text." },
  { id: "canonical", category: "seo", fix: "Add a canonical link pointing to the preferred page URL." },
  { id: "indexable", category: "seo", fix: "Remove noindex if this page should appear in search results." },
  { id: "open_graph", category: "seo", fix: "Add social sharing tags (Open Graph title, description and image) so links to your site show a proper preview." },
  { id: "structured_data", category: "seo", fix: "Add accurate LocalBusiness or Organization JSON-LD." },
  { id: "privacy", category: "security", fix: "Link to a current privacy policy." },
  { id: "copyright", category: "security", fix: "Review and update the copyright year." },
  { id: "click_to_call", category: "conversion", fix: "Add a click-to-call phone link." },
  { id: "phone", category: "conversion", fix: "Make the business phone number easy to find." },
  { id: "contact", category: "conversion", fix: "Add a contact form or an obvious contact page link." },
  { id: "cta", category: "conversion", fix: "Place a clear action near the top of the page." },
  { id: "booking", category: "conversion", fix: "Add an easy-to-find booking or quote link where appropriate." },
  { id: "email_link", category: "conversion", fix: "Offer a contact email link where appropriate." },
  { id: "address", category: "local", fix: "Show the business address where appropriate." },
  { id: "hours", category: "local", fix: "Show business hours where appropriate." },
  { id: "maps", category: "local", fix: "Link to or embed the correct Google Maps listing." },
  { id: "reviews", category: "local", fix: "Feature genuine customer reviews or testimonials." },
  { id: "social_links", category: "social", fix: "Link to active social profiles." },
  { id: "blog", category: "social", fix: "Link to useful news or articles if appropriate." },
  { id: "latest_post", category: "social", fix: "Publish or clearly date useful updates when appropriate." },
  { id: "accessibility_alt", category: "accessibility", fix: "Add meaningful alt text or mark decorative images with empty alt text." },
  { id: "language", category: "accessibility", fix: "Set the document language on the html element." },
];

export function unknownHtmlChecks(): Check[] {
  return definitions.map(({ id, category, fix }) => ({
    id, category, fix, status: "unknown", value: null, detail: "Couldn't check the page HTML.",
  }));
}

function text(value: string | null | undefined, max = 300): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function hasOrganization(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasOrganization);
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  return (Array.isArray(type) ? type : [type]).some((item) =>
    typeof item === "string" && /^(LocalBusiness|Organization)$/i.test(item))
    || Object.values(object).some(hasOrganization);
}

function parseHtml(html: string): Element {
  const node = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true, RETURN_DOM: true, ADD_TAGS: ["meta", "link", "script", "iframe"],
    ADD_ATTR: ["content", "name", "property", "rel", "href", "type", "src", "datetime"],
  });
  if (node.nodeType !== 1) throw new Error("Could not parse page HTML.");
  return node as Element;
}

export function extractPageText(html: string): string {
  const body = parseHtml(html).querySelector("body");
  for (const node of body?.querySelectorAll("script,style,noscript,template") ?? []) node.remove();
  return text(body?.textContent, 500_000);
}

export function htmlChecks(html: string): Check[] {
  const doc = parseHtml(html);
  const result = new Map<string, { status: CheckStatus; value: string | number | null; detail: string }>();
  const set = (id: string, status: CheckStatus, value: string | number | null, detail: string) => {
    result.set(id, { status, value, detail });
  };
  const heuristic = (id: string, found: boolean, label: string) =>
    set(id, found ? "pass" : "warn", found ? "Found" : "Not found",
      `${found ? "Found" : "Did not find"} ${label} in the downloaded HTML; this is a heuristic.`);
  const meta = (selector: string) => text(doc.querySelector(selector)?.getAttribute("content"), 500);
  const title = text(doc.querySelector("title")?.textContent, 500);
  const description = meta('meta[name="description" i]');
  set("title", !title ? "fail" : title.length >= 30 && title.length <= 60 ? "pass" : "warn",
    title || null, title ? `${title.length} characters.` : "No title was found.");
  set("description", !description ? "fail" : description.length >= 70 && description.length <= 160 ? "pass" : "warn",
    description || null, description ? `${description.length} characters.` : "No meta description was found.");
  const h1 = doc.querySelectorAll("h1");
  set("h1", h1.length === 1 ? "pass" : "warn", h1.length, `Found ${h1.length} H1 headings.`);
  const headings = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((element) => Number(element.tagName[1]));
  const skipped = headings.some((level, index) => index > 0 && level > headings[index - 1] + 1);
  set("headings", !headings.length ? "unknown" : skipped ? "warn" : "pass",
    headings.length, headings.length ? skipped ? "A heading level appears to be skipped." : "No skipped heading level was found." : "No headings were found.");
  const images = [...doc.querySelectorAll("img")];
  const alt = images.filter((image) => image.hasAttribute("alt")).length;
  const altPercent = images.length ? Math.round(100 * alt / images.length) : null;
  for (const id of ["image_alt", "accessibility_alt"]) {
    set(id, altPercent === null ? "unknown" : altPercent === 100 ? "pass" : "warn", altPercent,
      images.length ? `${alt} of ${images.length} images have an alt attribute; its quality was not checked.` : "No images were found.");
  }
  heuristic("viewport", Boolean(doc.querySelector('meta[name="viewport" i]')), "a viewport meta tag");
  const overflow = [...doc.querySelectorAll("[style]")].some((node) =>
    /(?:min-)?width\s*:\s*(?:[7-9]\d\d|[1-9]\d{3,})px/i.test(node.getAttribute("style") ?? ""));
  set("horizontal_overflow", overflow ? "warn" : "unknown", overflow ? "Possible fixed-width element" : null,
    overflow ? "A large inline fixed width may overflow on mobile; a visual test is needed." : "HTML alone cannot confirm horizontal overflow.");
  heuristic("canonical", Boolean(doc.querySelector('link[rel~="canonical" i][href]')), "a canonical link");
  const robots = meta('meta[name="robots" i]');
  set("indexable", /\bnoindex\b/i.test(robots) ? "fail" : "pass", robots || "No noindex meta tag",
    "Checks the page's robots meta tag only, not server headers or robots.txt.");
  const og = ["og:title", "og:description", "og:image"].filter((name) =>
    meta(`meta[property="${name}" i]`));
  set("open_graph", og.length === 3 ? "pass" : "warn", `${og.length}/3`,
    `${og.length} of 3 social sharing tags (title, description and image) were found.`);
  let structured = false;
  let malformedJson = false;
  for (const script of doc.querySelectorAll('script[type="application/ld+json" i]')) {
    try { structured ||= hasOrganization(JSON.parse(script.textContent ?? "")); }
    catch { malformedJson = true; }
  }
  set("structured_data", structured ? "pass" : malformedJson ? "unknown" : "warn", structured ? "Found" : null,
    structured ? "Found LocalBusiness or Organization JSON-LD." : malformedJson ? "Couldn't parse all JSON-LD." : "No LocalBusiness or Organization JSON-LD was found.");

  const links = [...doc.querySelectorAll("a[href]")];
  const linkMatches = (pattern: RegExp) => links.some((link) =>
    pattern.test(`${link.getAttribute("href") ?? ""} ${text(link.textContent)}`));
  heuristic("privacy", linkMatches(/privacy/i), "a privacy policy link");
  const body = doc.querySelector("body");
  for (const node of body?.querySelectorAll("script,style,noscript,template") ?? []) node.remove();
  const bodyText = text(body?.textContent, 500_000);
  const years = [...bodyText.matchAll(/(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)]
    .map((match) => Number(match[1])).filter((year) => year >= 1900 && year <= new Date().getUTCFullYear());
  const year = years.length ? Math.max(...years) : null;
  set("copyright", year === null ? "unknown" : year <= new Date().getUTCFullYear() - 2 ? "warn" : "pass",
    year, year ? `Latest copyright year found: ${year}.` : "No copyright year was found.");
  heuristic("click_to_call", linkMatches(/^\s*tel:/i), "a click-to-call link");
  heuristic("phone", /(?:\+?\d[\d().\s-]{7,}\d)/.test(bodyText), "a possible phone number");
  heuristic("contact", Boolean(doc.querySelector('form input[type="email" i],form input[type="tel" i],form input[name*="email" i],form input[name*="phone" i]'))
    || linkMatches(/contact|get.in.touch/i), "a contact form or contact page link");
  const firstElements = [...(body?.querySelectorAll("a,button,input[type=submit]") ?? [])].slice(0, 20);
  heuristic("cta", firstElements.some((element) => /contact|call|book|quote|schedule|start|enquir|inquir|get started/i
    .test(`${element.textContent ?? ""} ${element.getAttribute("value") ?? ""}`)), "an action-oriented link or button early in HTML order (not a visual fold test)");
  heuristic("booking", linkMatches(/book|appointment|schedule|quote/i), "a booking or quote link");
  heuristic("email_link", linkMatches(/^\s*mailto:/i), "an email link");
  heuristic("address", Boolean(doc.querySelector('[itemprop="streetAddress" i],address')) ||
    /\b\d{1,6}\s+[\w .'-]{2,60}\s(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr)\b/i.test(bodyText), "a possible address");
  heuristic("hours", /\b(?:hours|opening times|open(?:ing)? hours)\b/i.test(bodyText), "a possible hours section");
  heuristic("maps", linkMatches(/(?:google\.[^/]+\/maps|maps\.google\.)/i)
    || [...doc.querySelectorAll("iframe[src]")].some((node) => /(?:google\.[^/]+\/maps|maps\.google\.)/i.test(node.getAttribute("src") ?? "")), "a Google Maps link or embed");
  heuristic("reviews", /\b(?:reviews|testimonials|what our customers say)\b/i.test(bodyText), "a reviews or testimonials section");
  heuristic("social_links", linkMatches(/(?:facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|x\.com|twitter\.com)/i), "a social profile link");
  heuristic("blog", linkMatches(/\b(?:blog|news|articles)\b/i), "a blog or news link");
  const dates = [...doc.querySelectorAll("article time[datetime]")].map((node) => node.getAttribute("datetime") ?? "")
    .filter((date) => /^\d{4}-\d{2}-\d{2}/.test(date) && Number.isFinite(Date.parse(date)))
    .sort().reverse();
  set("latest_post", dates.length ? "pass" : "unknown", dates[0] ?? null,
    dates.length ? "Most recent date found in an article time element on this page." : "Couldn't detect a dated post on this page.");
  const lang = text(doc.getAttribute("lang"), 50);
  set("language", lang ? "pass" : "warn", lang || null, lang ? `Document language: ${lang}.` : "No document language was found.");

  return definitions.map(({ id, category, fix }) => ({
    id, category, fix,
    ...(result.get(id) ?? { status: "unknown" as const, value: null, detail: "Couldn't check." }),
  }));
}

export function profileCheck(input: GraderInput): Check {
  const profile = input.hasGoogleProfile;
  return {
    id: "google_profile", category: "local", value: profile ?? null,
    status: profile === "yes" ? "pass" : profile === "no" ? "fail" : profile === "not_sure" ? "warn" : "unknown",
    detail: profile === "yes" ? "You reported having a Google Business Profile; this was not verified."
      : profile === "no" ? "You reported not having a Google Business Profile; this was not verified."
      : profile === "not_sure" ? "You were unsure whether the business has a Google Business Profile."
      : "No Google Business Profile answer was provided.",
    fix: "Find or create the correct Google Business Profile and keep it current.",
  };
}
