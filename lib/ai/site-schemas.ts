import "server-only";

import { z } from "zod";
import type { Field } from "@puckeditor/core";
import { strictTool } from "./strict-tool";
import { puckConfig } from "@/lib/puck/config";
import { sectionCatalog } from "@/lib/sections/catalog";
import { buildDesignItem } from "@/lib/sections/library";
import { CURATED_FONT_NAMES } from "@/lib/theme/fonts";

type Fields = Record<string, Field>;
export const PAGE_SLUGS = ["", "about", "services", "contact"] as const;
export const aiCatalog = sectionCatalog.filter((design) => design.category !== "Blank");
export const designIds = aiCatalog.map((design) => design.id);
export const blockTypes = [...new Set(aiCatalog.map((design) => design.blockType))];

export function blockFields(type: string): Fields {
  const component = puckConfig.components[type as keyof typeof puckConfig.components];
  if (!component?.fields) throw new Error(`Missing fields for catalog block ${type}.`);
  return component.fields as Fields;
}

export function isImageField(field: Field): boolean {
  return field.type === "custom" && "aiKind" in field && field.aiKind === "image";
}

const link = z.string().max(500).refine(
  (value) => !value || /^(?:\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(value),
  "Use a page path, anchor, or a safe HTTP, email or telephone link.",
);

function fieldSchema(field: Field, key: string): z.ZodType {
  switch (field.type) {
    case "text":
    case "textarea":
    case "richtext":
      return /(?:href|link)$/i.test(key) ? link : z.string().max(field.type === "richtext" ? 8000 : 2000);
    case "number": return z.number().finite();
    case "radio":
    case "select": {
      const values = field.options.map(({ value }) => {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean" && value !== null) {
          throw new Error(`Unsupported option for ${key}.`);
        }
        return value;
      });
      if (values.length === 2 && values.includes(true) && values.includes(false)) return z.boolean();
      return z.literal(values);
    }
    case "array":
      return z.array(fieldsSchema(field.arrayFields as Fields)).max(12);
    case "object":
      return fieldsSchema(field.objectFields as Fields);
    case "custom":
      if (isImageField(field)) return z.string().max(160).describe("Photo search query, NOT a URL; empty for no photo.");
      if ("aiKind" in field && field.aiKind === "icon") return z.string().max(60);
      throw new Error(`Unsupported custom AI field: ${key}.`);
    default: throw new Error(`Unsupported AI field: ${key} (${field.type}).`);
  }
}

function fieldsSchema(fields: Fields) {
  return z.strictObject(Object.fromEntries(
    Object.entries(fields).filter(([key]) => key !== "design").map(([key, field]) => [key, fieldSchema(field, key)]),
  ));
}

export const blockSchemas = Object.fromEntries(blockTypes.map((type) => [type, fieldsSchema(blockFields(type))]));
const catalogById = new Map(aiCatalog.map((design) => [design.id, design]));
const seoSchema = z.strictObject({
  title: z.string().min(1).max(59),
  description: z.string().min(1).max(159),
});
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const planSchema = z.strictObject({
  style: z.enum(["classic", "modern"]),
  colors: z.strictObject({ primary: color, secondary: color, background: color, text: color }),
  fonts: z.strictObject({ heading: z.enum(CURATED_FONT_NAMES), body: z.enum(CURATED_FONT_NAMES) }),
  pages: z.array(z.strictObject({
    slug: z.enum(PAGE_SLUGS),
    title: z.string().min(1).max(80),
    sections: z.array(z.strictObject({
      blockType: z.enum(blockTypes), designId: z.enum(designIds),
    })).min(2).max(7),
  })).length(4),
  seo: z.strictObject({ home: seoSchema, about: seoSchema, services: seoSchema, contact: seoSchema }),
}).superRefine((plan, ctx) => {
  if (new Set(plan.pages.map((page) => page.slug)).size !== 4) {
    ctx.addIssue({ code: "custom", path: ["pages"], message: "Include Home, About, Services and Contact exactly once." });
  }
  plan.pages.forEach((page, pageIndex) => page.sections.forEach(({ blockType, designId }, sectionIndex) => {
    const design = catalogById.get(designId);
    if (design?.blockType !== blockType || !design.styles.includes(plan.style)) {
      ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "sections", sectionIndex],
        message: "Use a catalog blockType/designId pair that supports the selected style." });
    }
  }));
});
export type SitePlan = z.infer<typeof planSchema>;
type PlannedPage = SitePlan["pages"][number];

export const PLAN_SITE_TOOL = strictTool("plan_site", "Return the site plan, without section props.", planSchema);

const fillPropsByType = new Map(blockTypes.map((blockType) => {
  const imageField = Object.entries(blockFields(blockType)).find(([, field]) => isImageField(field))?.[0];
  const props = Object.entries(blockSchemas[blockType].shape).filter(([key]) => key !== "variant");
  // Keep optional grammar branches bounded: only the primary image query can
  // be omitted. Other fields with no content can be returned empty.
  const schema = z.strictObject(Object.fromEntries(props.map(([key, field]) =>
    [key, key === imageField ? field.optional() : field]))).superRefine((value, ctx) => {
    if (blockType !== "Testimonials" || !Array.isArray(value.testimonials)) return;
    if (value.testimonials.some((review) => review && typeof review === "object" && Object.values(review).some(
      (field) => typeof field === "string" && field !== "" && !/^\[.+\]$/.test(field),
    ))) {
      ctx.addIssue({ code: "custom", path: ["testimonials"], message: "Use clearly marked review placeholders." });
    }
  });
  return [blockType, { schema, imageField }] as const;
}));

export function pageFillContract(page: PlannedPage) {
  // Named slots preserve the plan's order without a heterogeneous array union
  // or tuple keywords unsupported by the provider's strict schema compiler.
  const slots = page.sections.map(({ blockType, designId }, index) => {
    const props = fillPropsByType.get(blockType);
    if (!props || catalogById.get(designId)?.blockType !== blockType) throw new Error("Invalid planned section.");
    return { key: `section_${index + 1}`, designId, blockType, ...props };
  });
  const sections = z.strictObject(Object.fromEntries(slots.map(({ key, schema }) => [key, schema])));
  const schema = z.strictObject({ slug: z.literal(page.slug), sections });
  const task = `Write only the props for the named section slots in this page plan. Layout variants are set by the application:\n${JSON.stringify({
    slug: page.slug, title: page.title,
    sections: Object.fromEntries(slots.map(({ key, designId, blockType }) => [key, { blockType, designId }])),
  })}`;
  return { slots, schema, task, tool: strictTool("fill_page", "Return props for the planned page's section slots.", schema) };
}

export function defaultSection(designId: string) {
  const design = catalogById.get(designId);
  if (!design) throw new Error("Unknown catalog design.");
  return buildDesignItem(design);
}
