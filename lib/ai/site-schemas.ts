import "server-only";

import { z } from "zod";
import type { Field } from "@puckeditor/core";
import { strictTool } from "./strict-tool";
import { SECTION_COPY_BRIEFS } from "./site-prompt-briefs";
import { puckConfig } from "@/lib/puck/config";
import { sectionCatalog } from "@/lib/sections/catalog";
import { buildDesignItem } from "@/lib/sections/library";
import { iconNameSchema } from "@/lib/icons";
import { siteLinkSchema } from "@/lib/links";

type Fields = Record<string, Field>;
export const aiCatalog = sectionCatalog.filter((design) => design.category !== "Blank");
export const designIds = aiCatalog.map((design) => design.id);
export const blockTypes = [...new Set(aiCatalog.map((design) => design.blockType))];

export function blockFields(type: string): Fields {
  const component = puckConfig.components[type as keyof typeof puckConfig.components];
  if (!component?.fields) throw new Error(`Missing fields for catalog block ${type}.`);
  return component.fields as Fields;
}

export function validateBlockProps(type: string, value: unknown) {
  return fieldsSchema(blockFields(type)).parse(value);
}

export function isImageField(field: Field): boolean {
  return field.type === "custom" && "aiKind" in field && field.aiKind === "image";
}

const link = z.string().max(500).refine(
  (value) => !value || /^(?:\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(value),
  "Use a page path, anchor, or a safe HTTP, email or telephone link.",
);

/**
 * `agent` builds the schema for edits to stored content: links may be the typed
 * links the link picker stores, images are the stored URLs (changed only through
 * set_image) and lists may be as long as the editor allows.
 */
function fieldSchema(field: Field, key: string, agent = false): z.ZodType {
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
      return z.array(fieldsSchema(field.arrayFields as Fields, agent)).max(agent ? 40 : 12);
    case "object":
      return fieldsSchema(field.objectFields as Fields, agent);
    case "custom":
      if (isImageField(field)) return agent ? z.string().max(2000)
        : z.string().max(160).describe("Photo search query, NOT a URL; empty for no photo.");
      if ("aiKind" in field && field.aiKind === "icon") return iconNameSchema;
      if ("aiKind" in field && field.aiKind === "link") return agent ? z.union([link, siteLinkSchema]) : link;
      throw new Error(`Unsupported custom AI field: ${key}.`);
    default: throw new Error(`Unsupported AI field: ${key} (${field.type}).`);
  }
}

function fieldsSchema(fields: Fields, agent = false) {
  return z.strictObject(Object.fromEntries(
    Object.entries(fields).filter(([key]) => key !== "design").map(([key, field]) => [key, fieldSchema(field, key, agent)]),
  ));
}

const agentSchemas = new Map<string, Record<string, z.ZodType>>();
/**
 * One schema per property the agent may edit on a stored block or layout
 * element. Properties the AI schemas cannot express (slots, pickers without an
 * AI kind) are left out, so the agent cannot change them.
 */
export function agentFieldSchemas(type: string): Record<string, z.ZodType> {
  let schemas = agentSchemas.get(type);
  if (!schemas) {
    schemas = {};
    for (const [key, field] of Object.entries(blockFields(type))) {
      if (key === "design" || key === "id") continue;
      try { schemas[key] = fieldSchema(field, key, true); } catch { /* not editable by the agent */ }
    }
    agentSchemas.set(type, schemas);
  }
  return schemas;
}

/** A compact description of the editable properties, for the agent to read. */
export function describeAgentFields(type: string): Record<string, unknown> {
  const describe = (fields: Fields, top: boolean): Record<string, unknown> => Object.fromEntries(
    Object.entries(fields).flatMap(([key, field]): [string, unknown][] => {
      if (key === "design" || key === "id" || (top && !(key in agentFieldSchemas(type)))) return [];
      switch (field.type) {
        case "text": case "textarea": return [[key, /(?:href|link)$/i.test(key) ? "link" : "text"]];
        case "richtext": return [[key, "rich text (HTML)"]];
        case "number": return [[key, "number"]];
        case "radio": case "select": return [[key, field.options.map(({ value }) => value)]];
        case "array": return [[key, [describe(field.arrayFields as Fields, false)]]];
        case "object": return [[key, describe(field.objectFields as Fields, false)]];
        default:
          if (isImageField(field)) return [[key, "image (choose with set_image)"]];
          return "aiKind" in field ? [[key, field.aiKind === "icon" ? "icon name" : "link"]] : [];
      }
    }));
  return describe(blockFields(type), true);
}

export const blockSchemas = Object.fromEntries(blockTypes.map((type) => [type, fieldsSchema(blockFields(type))]));
const catalogById = new Map(aiCatalog.map((design) => [design.id, design]));
export type SiteTheme = {
  style: "classic" | "modern";
  colors: { primary: string; secondary: string; background: string; text: string };
  fonts: { heading: string; body: string };
};
export type PlannedPage = {
  slug: string; title: string; sections: { blockType: string; designId: string }[];
  seo?: { title: string; description: string };
};

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
  })}\nSECTION BRIEFS:\n${[...new Set(slots.map(({ blockType }) => blockType))]
    .filter((type) => SECTION_COPY_BRIEFS[type]).map((type) => `- ${type}: ${SECTION_COPY_BRIEFS[type]}`).join("\n")}`;
  const tool = { ...strictTool("fill_page", "Return props for the planned page's section slots.", schema), strict: false };
  return { slots, schema, task, tool };
}

export function defaultSection(designId: string) {
  const design = catalogById.get(designId);
  if (!design) throw new Error("Unknown catalog design.");
  return buildDesignItem(design);
}
