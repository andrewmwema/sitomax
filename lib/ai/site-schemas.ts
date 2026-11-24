import "server-only";

import { z } from "zod";
import type { Field } from "@puckeditor/core";
import { strictTool } from "./strict-tool";
import { SECTION_COPY_BRIEFS } from "./site-prompt-briefs";
import { puckConfig } from "@/lib/puck/config";
import { sectionCatalog, sectionContentMetadata, type SectionContentMetadata } from "@/lib/sections/catalog";
import { buildDesignItem } from "@/lib/sections/library";
import { iconNameSchema } from "@/lib/icons";
import { siteLinkSchema } from "@/lib/links";
import type { ImageAspectMetadata } from "@/lib/puck/fields";

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
  return fieldsSchema(blockFields(type), false, sectionContentMetadata(type)).parse(value);
}

type AiImageField = Field & { aiKind: "image"; aiAspectRatio: ImageAspectMetadata };

export function isImageField(field: Field): field is AiImageField {
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
function fieldSchema(field: Field, key: string, agent = false, metadata?: SectionContentMetadata, path = key): z.ZodType {
  const limit = agent ? undefined : metadata?.limits[path];
  switch (field.type) {
    case "text":
    case "textarea":
    case "richtext":
      return /(?:href|link)$/i.test(key) ? link : z.string().max(limit?.maxLength ?? (field.type === "richtext" ? 8000 : 2000));
    case "number": return limit?.maxValue === undefined ? z.number().finite() : z.number().finite().max(limit.maxValue);
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
      return z.array(fieldsSchema(field.arrayFields as Fields, agent, metadata, `${path}[].`)).max(limit?.maxItems ?? (agent ? 40 : 12));
    case "object":
      return fieldsSchema(field.objectFields as Fields, agent, metadata, `${path}.`);
    case "custom":
      if (isImageField(field)) return agent ? z.string().max(2000)
        : z.string().max(160).describe("Photo search query, NOT a URL; empty for no photo.");
      if ("aiKind" in field && field.aiKind === "icon") return iconNameSchema;
      if ("aiKind" in field && field.aiKind === "link") return agent ? z.union([link, siteLinkSchema]) : link;
      throw new Error(`Unsupported custom AI field: ${key}.`);
    default: throw new Error(`Unsupported AI field: ${key} (${field.type}).`);
  }
}

function fieldsSchema(fields: Fields, agent = false, metadata?: SectionContentMetadata, prefix = "") {
  return z.strictObject(Object.fromEntries(
    Object.entries(fields).filter(([key]) => key !== "design").map(([key, field]) => [key, fieldSchema(field, key, agent, metadata, `${prefix}${key}`)]),
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

export const blockSchemas = Object.fromEntries(blockTypes.map((type) => [type, fieldsSchema(blockFields(type), false, sectionContentMetadata(type))]));

type AiBlockField = {
  type: "text" | "textarea" | "richtext" | "number" | "choice" | "array" | "object" | "image" | "link" | "icon";
  maxLength?: number;
  options?: { label: string; value: string | number | boolean | null }[];
  maxItems?: number;
  maxValue?: number;
  fields?: Record<string, AiBlockField>;
  aspectRatio?: ImageAspectMetadata;
};

function aiBlockField(field: Field, key: string, metadata: SectionContentMetadata, path: string): AiBlockField | null {
  const limit = metadata.limits[path];
  switch (field.type) {
    case "text":
      return { type: /(?:href|link)$/i.test(key) ? "link" : "text", maxLength: /(?:href|link)$/i.test(key) ? 500 : limit?.maxLength ?? 2000 };
    case "textarea": return { type: "textarea", maxLength: limit?.maxLength ?? 2000 };
    case "richtext": return { type: "richtext", maxLength: limit?.maxLength ?? 8000 };
    case "number": return { type: "number", ...(limit?.maxValue !== undefined ? { maxValue: limit.maxValue } : {}) };
    case "radio":
    case "select": {
      const options = field.options.map(({ label, value }) => {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean" && value !== null) {
          throw new Error(`Unsupported option for ${key}.`);
        }
        return { label, value };
      });
      return {
        type: "choice",
        options,
      };
    }
    case "array":
      return { type: "array", maxItems: limit?.maxItems ?? 40, fields: aiBlockFields(field.arrayFields as Fields, metadata, `${path}[].`) };
    case "object":
      return { type: "object", fields: aiBlockFields(field.objectFields as Fields, metadata, `${path}.`) };
    case "custom":
      if (isImageField(field)) return { type: "image", maxLength: 2000, aspectRatio: field.aiAspectRatio };
      if ("aiKind" in field && field.aiKind === "link") return { type: "link", maxLength: 500 };
      if ("aiKind" in field && field.aiKind === "icon") return { type: "icon" };
      return null;
    default: return null;
  }
}

function aiBlockFields(fields: Fields, metadata: SectionContentMetadata, prefix = ""): Record<string, AiBlockField> {
  return Object.fromEntries(Object.entries(fields).flatMap(([key, field]) => {
    if (key === "design" || key === "id") return [];
    const info = aiBlockField(field, key, metadata, `${prefix}${key}`);
    return info ? [[key, info]] : [];
  }));
}

export const aiBlockCatalog = blockTypes.map((blockType) => {
  const fields = blockFields(blockType);
  const variant = fields.variant;
  return {
    blockType,
    label: puckConfig.components[blockType as keyof typeof puckConfig.components].label,
    variants: variant && (variant.type === "select" || variant.type === "radio")
      ? variant.options.map(({ label, value }) => ({ label, value }))
      : [],
    fields: Object.fromEntries(Object.entries(aiBlockFields(fields, sectionContentMetadata(blockType)))
      .filter(([key]) => key in agentFieldSchemas(blockType))),
  };
});

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

const DEFAULTED_CONVERSION_FIELDS = new Set([
  "buttonAction", "buttonFormName", "secondaryButtonAction", "secondaryButtonFormName",
  "secondaryButtonText", "secondaryButtonLink", "trustLine",
]);
const fillPropsByType = new Map(blockTypes.map((blockType) => {
  const imageField = Object.entries(blockFields(blockType)).find(([, field]) => isImageField(field))?.[0];
  const makeSchema = (includeDefaultedConversionFields: boolean) => {
    const props = Object.entries(blockSchemas[blockType].shape).filter(([key]) =>
      key !== "variant" && (includeDefaultedConversionFields || !DEFAULTED_CONVERSION_FIELDS.has(key)));
    const schema = z.strictObject(Object.fromEntries(props.map(([key, field]) => [
      key,
      key === imageField || (includeDefaultedConversionFields && DEFAULTED_CONVERSION_FIELDS.has(key))
        ? field.optional()
        : field,
    ])));
    return schema.superRefine((value, ctx) => {
      if (blockType !== "Testimonials" || !Array.isArray(value.testimonials)) return;
      if (value.testimonials.some((review) => review && typeof review === "object" && Object.values(review).some(
        (field) => typeof field === "string" && field !== "" && !/^\[.+\]$/.test(field),
      ))) {
        ctx.addIssue({ code: "custom", path: ["testimonials"], message: "Use clearly marked review placeholders." });
      }
    });
  };
  return [blockType, { schema: makeSchema(true), toolSchema: makeSchema(false), imageField }] as const;
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
  const toolSections = z.strictObject(Object.fromEntries(slots.map(({ key, toolSchema }) => [key, toolSchema])));
  const schema = z.strictObject({ slug: z.literal(page.slug), sections });
  const inputSchema = z.strictObject({ slug: z.literal(page.slug), sections: toolSections });
  const task = `Write only the props for the named section slots in this page plan. Layout variants are set by the application:\n${JSON.stringify({
    slug: page.slug, title: page.title,
    sections: Object.fromEntries(slots.map(({ key, designId, blockType }) => [key, { blockType, designId }])),
  })}\nSECTION BRIEFS:\n${[...new Set(slots.map(({ blockType }) => blockType))]
    .filter((type) => SECTION_COPY_BRIEFS[type]).map((type) => `- ${type}: ${SECTION_COPY_BRIEFS[type]}`).join("\n")}`;
  const tool = { ...strictTool("fill_page", "Return props for the planned page's section slots.", inputSchema), strict: false };
  return { slots, schema, task, tool };
}

export function defaultSection(designId: string) {
  const design = catalogById.get(designId);
  if (!design) throw new Error("Unknown catalog design.");
  return buildDesignItem(design);
}
