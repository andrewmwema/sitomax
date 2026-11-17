import { isNoindex, rootSeoSchema, type SiteSeo } from "@/lib/seo";

export function seoChecklist(data: unknown, pageTitle: string | null, seo: SiteSeo) {
  const object = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const root = object.root && typeof object.root === "object" ? object.root as Record<string, unknown> : {};
  const result = rootSeoSchema.safeParse(root.props ?? {});
  const props = result.success ? result.data : {};
  const title = props.seoTitle?.trim() || props.title?.trim() || pageTitle || "";
  const description = props.description?.trim() || "";
  let hasH1 = false;
  let missingAlt = false;
  function walk(value: unknown) {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    if (obj.type === "Hero" && obj.props && typeof obj.props === "object" && (obj.props as Record<string, unknown>).heading) hasH1 = true;
    if (obj.type === "Heading" && obj.props && typeof obj.props === "object") {
      const heading = obj.props as Record<string, unknown>;
      if (heading.level === "h1" && typeof heading.text === "string" && heading.text.trim()) hasH1 = true;
    }
    for (const [key, child] of Object.entries(obj)) {
      if (typeof child === "string" && /<h1(?:\s|>)/i.test(child)) hasH1 = true;
      if (typeof child === "string" && child.trim() && (key === "src" || key === "image" || key === "backgroundImage" || key === "secondaryImage")) {
        const altKey = key === "src" ? "alt" : `${key}Alt`;
        if (typeof obj[altKey] !== "string" || !(obj[altKey] as string).trim()) missingAlt = true;
      }
      if (key === "images" && Array.isArray(child)) {
        for (const image of child) if (image && typeof image === "object" && typeof image.url === "string" && image.url && (typeof image.alt !== "string" || !image.alt.trim())) missingAlt = true;
      }
      if (key !== "design" && key !== "code") walk(child);
    }
  }
  walk(object.content);
  const issues = [
    !title ? "Missing SEO title" : title.length > 60 ? "SEO title is over 60 characters" : "",
    !description ? "Missing meta description" : description.length > 160 ? "Meta description is over 160 characters" : "",
    !(props.socialImage || seo.socialImage) ? "Missing social share image" : "",
    missingAlt ? "Images missing alt text" : "",
    !hasH1 ? "Page has no H1 heading" : "",
    isNoindex({ noindex: props.indexing === "inherit" || !props.indexing ? null : props.indexing === "noindex" }, seo) ? "Page is hidden from search engines" : "",
  ].filter(Boolean);
  return { issues, score: Math.round((6 - issues.length) / 6 * 100) };
}
