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
    case "select":
      return z.union(field.options.map(({ value }) => {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean" && value !== null) {
          throw new Error(`Unsupported option for ${key}.`);
        }
        return z.literal(value);
      }));
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
      designId: z.enum(designIds), purpose: z.string().min(1).max(500),
    })).min(2).max(7),
  })).length(4),
  seo: z.strictObject({ home: seoSchema, about: seoSchema, services: seoSchema, contact: seoSchema }),
}).superRefine((plan, ctx) => {
  if (new Set(plan.pages.map((page) => page.slug)).size !== 4) {
    ctx.addIssue({ code: "custom", path: ["pages"], message: "Include Home, About, Services and Contact exactly once." });
  }
});
export type SitePlan = z.infer<typeof planSchema>;

export const fillSchema = z.strictObject({
  slug: z.enum(PAGE_SLUGS),
  sections: z.array(z.union(blockTypes.map((type) => z.strictObject({
    blockType: z.literal(type),
    designId: z.enum(aiCatalog.filter((design) => design.blockType === type).map((design) => design.id)),
    props: blockSchemas[type],
  })))).min(2).max(7),
});

// Keep tools identical between planning, parallel pages and validation retries:
// tool definitions precede the cached system prompt in the provider's cache key.
export const GENERATION_TOOLS = [
  strictTool("plan_site", "Return the validated site plan.", planSchema),
  strictTool("fill_page", "Return the validated page content.", fillSchema),
];

export function defaultSection(designId: string) {
  const design = aiCatalog.find((entry) => entry.id === designId);
  if (!design) throw new Error("Unknown catalog design.");
  return buildDesignItem(design);
}
