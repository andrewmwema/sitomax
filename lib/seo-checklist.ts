import type { Data } from "@puckeditor/core";
import { findUnreplacedPlaceholders } from "@/lib/sections/placeholders";
import { isNoindex, pageSeoSchema, rootSeoSchema, type SiteSeo } from "@/lib/seo";
import { isRichHeading } from "@/lib/richtext";

export type SeoCheckKey = "title" | "description" | "socialImage" | "alt" | "h1" | "placeholders" | "indexing";
export type SeoCheck = { key: SeoCheckKey; label: string; complete: boolean; targetId?: string };

export function seoChecklist(data: unknown, pageTitle: string | null, seo: SiteSeo, pageSeo?: unknown) {
  const object = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const root = object.root && typeof object.root === "object" ? object.root as Record<string, unknown> : {};
  const result = rootSeoSchema.safeParse(root.props ?? {});
  const props = result.success ? result.data : {};
  const savedSeo = pageSeoSchema.safeParse(pageSeo);
  const saved = savedSeo.success ? savedSeo.data : {};
  const content = Array.isArray(object.content) ? object.content : [];
  const title = props.seoTitle?.trim() || props.title?.trim() || saved.title?.trim() || pageTitle || "";
  const description = props.description !== undefined ? props.description.trim() : saved.description?.trim() || "";
  let hasH1 = false;
  let missingAlt = false;
  let altTargetId: string | undefined;
  let h1TargetId: string | undefined;
  let firstTargetId: string | undefined;
  let firstMeaningfulTargetId: string | undefined;
  function walk(value: unknown, parentId?: string) {
    if (Array.isArray(value)) { value.forEach((child) => walk(child, parentId)); return; }
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    const item = typeof obj.type === "string" && obj.props && typeof obj.props === "object"
      ? obj.props as Record<string, unknown> : null;
    const itemId = typeof item?.id === "string" ? item.id : parentId;
    if (!firstTargetId && itemId) firstTargetId = itemId;
    if (!firstMeaningfulTargetId && itemId && obj.type !== "Navigation" && obj.type !== "Footer") firstMeaningfulTargetId = itemId;
    if (obj.type === "Hero" && typeof item?.heading === "string" && item.heading.trim() && !isRichHeading(item.heading)) {
      hasH1 = true;
      h1TargetId ??= itemId;
    }
    if (obj.type === "Heading" && item) {
      if (item.level === "h1" && typeof item.text === "string" && item.text.trim()) {
        hasH1 = true;
        h1TargetId ??= itemId;
      } else h1TargetId ??= itemId;
    }
    for (const [key, child] of Object.entries(obj)) {
      if (typeof child === "string" && /<h1(?:\s|>)/i.test(child)) {
        hasH1 = true;
        h1TargetId ??= itemId;
      }
      if (typeof child === "string" && child.trim() && (key === "src" || key === "image" || key === "backgroundImage" || key === "secondaryImage")) {
        const altKey = key === "src" ? "alt" : `${key}Alt`;
        if (typeof obj[altKey] !== "string" || !(obj[altKey] as string).trim()) {
          missingAlt = true;
          altTargetId ??= itemId;
        }
      }
      if (key === "images" && Array.isArray(child)) {
        for (const image of child) if (image && typeof image === "object" && typeof image.url === "string" && image.url && (typeof image.alt !== "string" || !image.alt.trim())) {
          missingAlt = true;
          altTargetId ??= itemId;
        }
      }
      if (key !== "design" && key !== "code") walk(child, itemId);
    }
  }
  walk(content);
  const placeholders = findUnreplacedPlaceholders({ content } as Partial<Data>);
  const indexing = props.indexing !== undefined
    ? props.indexing === "inherit" ? null : props.indexing === "noindex"
    : saved.noindex ?? null;
  const hidden = isNoindex({ noindex: indexing }, seo);
  const socialImage = props.socialImage !== undefined
    ? props.socialImage || seo.socialImage
    : saved.image || seo.socialImage;
  const checks: SeoCheck[] = [
    { key: "title", label: !title ? "Missing SEO title" : title.length > 60 ? "SEO title is over 60 characters" : "SEO title looks good", complete: Boolean(title) && title.length <= 60 },
    { key: "description", label: !description ? "Missing meta description" : description.length > 160 ? "Meta description is over 160 characters" : "Meta description looks good", complete: Boolean(description) && description.length <= 160 },
    { key: "socialImage", label: socialImage ? "Social share image is set" : "Missing social share image", complete: Boolean(socialImage) },
    { key: "alt", label: missingAlt ? "Images missing alt text" : "All images have alt text", complete: !missingAlt, ...(altTargetId ? { targetId: altTargetId } : {}) },
    { key: "h1", label: hasH1 ? "Page has an H1 heading" : "Page has no H1 heading", complete: hasH1, ...(h1TargetId || firstMeaningfulTargetId || firstTargetId ? { targetId: h1TargetId || firstMeaningfulTargetId || firstTargetId } : {}) },
    { key: "placeholders", label: placeholders.length ? "Unreplaced placeholders" : "No unreplaced placeholders", complete: placeholders.length === 0, ...(placeholders[0] ? { targetId: (content as Array<{ props?: { id?: string } }>)[placeholders[0].index]?.props?.id } : {}) },
    { key: "indexing", label: hidden ? "Page is hidden from search engines" : "Page is visible to search engines", complete: !hidden },
  ];
  const issues = checks.filter((check) => !check.complete).map((check) => check.label);
  return { issues, checks, score: Math.round((checks.length - issues.length) / checks.length * 100) };
}
