import { z } from "zod";
import type { Data, Field } from "@puckeditor/core";
import { puckConfig } from "@/lib/puck/config";
import { editorTree, ROOT_ZONE } from "@/lib/editor/tree";
import { collectEmbeds } from "@/lib/layout/embed";
import { safeHref } from "@/lib/layout/guardrails";
import { sectionCatalog } from "@/lib/sections/catalog";
import { buildDesignItem } from "@/lib/sections/library";
import { cleanPhotoCredits } from "@/lib/editor/media";
import { designPatchSchema, editDesign, editTheme, themePatchSchema } from "./edit-design";
import type { SiteTheme } from "@/lib/theme/presets";
import type { BlockDesign } from "@/lib/sections/design";

export const editScopes = ["section", "page", "theme"] as const;
export type EditScope = (typeof editScopes)[number];
const id = z.string().min(1).max(200);
const MAX_SECTIONS = 60;
export const editInput = z.strictObject({
  pageId: z.uuid(), scope: z.enum(editScopes), sectionId: id.optional(),
  instruction: z.string().trim().min(1).max(2000), refinement: z.string().max(4000).optional(),
  sections: z.array(z.strictObject({ type: id, props: z.looseObject({ id }) })).max(MAX_SECTIONS).optional(),
  sectionPosition: z.strictObject({ index: z.number().int().min(0).max(MAX_SECTIONS - 1), count: z.number().int().min(1).max(MAX_SECTIONS) })
    .refine(({ index, count }) => index < count).optional(),
});
const plain = z.string().max(8000).refine((value) => !/<(?:[a-z!/][^>]*|\/[a-z][^>]*)>/i.test(value), "Use plain text, not markup.");
export const editToolSchemas = {
  report_plan: z.strictObject({ plan: plain.min(1).max(600) }),
  update_theme: z.strictObject({ patch: themePatchSchema }),
  update_section_design: z.strictObject({ sectionId: id, patch: designPatchSchema }),
  switch_section_design: z.strictObject({ sectionId: id, designId: id }),
  update_section_props: z.strictObject({ sectionId: id, patch: z.record(z.string(), z.unknown()) }),
  move_section: z.strictObject({ sectionId: id, position: z.enum(["up", "down", "first", "last"]) }),
  duplicate_section: z.strictObject({ sectionId: id }),
  delete_section: z.strictObject({ sectionId: id }),
};

type Fields = Record<string, Field>;
type Props = Record<string, unknown>;
function record(value: unknown): Props {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Props : {};
}
function fieldsFor(type: string): Fields {
  return (puckConfig.components[type as keyof typeof puckConfig.components]?.fields ?? {}) as Fields;
}
const linkField = /(?:href|link|url)$/i;
const factualField = /^(?:testimonials|reviews|email|phone|address|hours|price|rating|latitude|longitude|value)$/i;
function fieldSchema(key: string, field: Field): z.ZodType | undefined {
  if (factualField.test(key)) return;
  if (["text", "textarea", "richtext"].includes(field.type)) {
    if (/^(?:code|src)$/i.test(key)) return;
    return linkField.test(key) ? plain.max(2000).refine((value) =>
      !/[\\\u0000-\u001f]/.test(value) && (value === "" || value === "#" || safeHref(value) !== "#"), "Use a safe link.") : plain;
  }
  if (field.type === "number") return z.number().min(field.min ?? -10000).max(field.max ?? 10000);
  if (field.type === "select" || field.type === "radio") {
    const values = field.options.map((option) => option.value).filter((value) => ["string", "boolean", "number"].includes(typeof value));
    if (values.length) return z.union(values.map((value) => z.literal(value as string | number | boolean)));
  }
  if (field.type === "array") return z.array(sectionPropsSchema(field.arrayFields as Fields)).max(12);
  if (field.type === "object") return sectionPropsSchema(field.objectFields as Fields);
}

function sectionPropsSchema(fields: Fields) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(fields)) {
    const schema = fieldSchema(key, field);
    if (schema) shape[key] = schema.optional();
  }
  return z.strictObject(shape);
}

function escapeText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function mergeProps(fields: Fields, old: Props, patch: Props): Props {
  const next = { ...old };
  for (const [key, value] of Object.entries(patch)) {
    const field = fields[key];
    if (field.type === "array" && Array.isArray(value)) {
      const previous = Array.isArray(old[key]) ? old[key] : [];
      if (value.length > previous.length && Object.keys(field.arrayFields ?? {}).some((key) => factualField.test(key))) {
        throw new Error("This list contains factual entries. Add new entries manually with verified details.");
      }
      next[key] = value.map((entry, index) => mergeProps(field.arrayFields as Fields,
        record(previous[index] ?? field.defaultItemProps), record(entry)));
    } else if (field.type === "object") next[key] = mergeProps(field.objectFields as Fields, record(old[key]), record(value));
    else if (field.type === "richtext" && typeof value === "string") {
      next[key] = value.split(/\n{2,}/).map((text) => `<p>${escapeText(text).replaceAll("\n", "<br>")}</p>`).join("");
    } else next[key] = typeof value === "string" && linkField.test(key) && value ? safeHref(value) : value;
  }
  return next;
}

export function updateEditableProps(type: string, previous: Props, patch: unknown) {
  const fields = fieldsFor(type);
  const values = sectionPropsSchema(fields).parse(patch);
  return mergeProps(fields, previous, values);
}

function readableProps(fields: Fields, props: Props): Props {
  return Object.fromEntries(Object.entries(fields).flatMap<[string, unknown]>(([key, field]) => {
    const value = props[key];
    if (field.type === "array" && Array.isArray(value)) return [[key, value.slice(0, 12).map((entry) => readableProps(field.arrayFields as Fields, record(entry)))]];
    if (field.type === "object") return [[key, readableProps(field.objectFields as Fields, record(value))]];
    if (typeof value === "string" && (fieldSchema(key, field) || ("aiKind" in field && field.aiKind === "image"))) {
      return [[key, value.replace(/<[^>]*>/g, " ").slice(0, 8000)]];
    }
    return fieldSchema(key, field) && (typeof value === "number" || typeof value === "boolean") ? [[key, value]] : [];
  }));
}

export function scopedSections(data: Data, scope: EditScope, selected?: string) {
  if (scope === "theme") return [];
  const entries = editorTree(data);
  const root = scope === "section" ? entries.find(({ item, parentId }) => !parentId && item.props.id === selected) : undefined;
  if (scope === "section" && !root) throw new Error("Select a top-level section first.");
  const ids = new Set(root ? [root.item.props.id] : []);
  return entries.filter(({ item, parentId }) => {
    if (root && item !== root.item && (!parentId || !ids.has(parentId))) return false;
    ids.add(item.props.id);
    return item.type !== "Embed";
  });
}

export function sectionContext(data: Data, scope: EditScope, selected?: string) {
  return scopedSections(data, scope, selected).map(({ item, parentId }) => ({
    id: item.props.id, type: item.type, parentId, props: readableProps(fieldsFor(item.type), item.props),
    design: item.props.design,
    editableProps: Object.fromEntries(Object.entries(fieldsFor(item.type)).flatMap(([key, field]) =>
      fieldSchema(key, field) ? [[key, field.type === "select" || field.type === "radio" ? field.options.map(({ value }) => value) : field.type]] : [])),
    canUseSectionTools: !parentId && !collectEmbeds(item).length,
  }));
}

type Operation = { name: string; input: unknown };
export function applyEditOperations(base: Data, theme: SiteTheme, scope: EditScope, selected: string | undefined,
  operations: Operation[], mediaAllowed: (url: string) => boolean, inserted?: { type: string; props: Props }) {
  const next = structuredClone(base);
  const allowed = new Set(scopedSections(next, scope, selected).map(({ item }) => item.props.id));
  const warnings = new Set<string>();
  const changes: string[] = [];
  const deleted: string[] = [];
  let nextTheme = theme;
  let insertion = false;
  for (const { name, input } of operations) {
    if (name === "report_plan") continue;
    if (scope === "theme") {
      if (name !== "update_theme") throw new Error("Only theme edits are allowed in this scope.");
      const { patch } = editToolSchemas.update_theme.parse(input);
      nextTheme = editTheme(nextTheme, patch, warnings);
      changes.push(`Update theme: ${[...Object.keys(patch.colors ?? {}), ...Object.keys(patch).filter((key) => key !== "colors")].join(", ")}.`);
      continue;
    }
    if (name === "insert_section") {
      if (insertion) throw new Error("Add only one new section per request.");
      insertion = true;
      const index = scope === "section" ? next.content.findIndex((item) => item.props.id === selected) + 1 : next.content.length;
      if (scope === "section" && !index) throw new Error("Cannot insert after a deleted section.");
      if (inserted) {
        if (typeof inserted.props.id !== "string") throw new Error("The new section has no valid ID.");
        next.content.splice(index, 0, { ...inserted, props: { ...inserted.props, id: inserted.props.id } });
        changes.push(`Add ${inserted.type} section.`);
      }
      continue;
    }
    const sectionId = z.object({ sectionId: id }).parse(input).sectionId;
    const entry = editorTree(next).find(({ item }) => item.props.id === sectionId);
    if (!allowed.has(sectionId) || !entry || entry.item.type === "Embed") throw new Error("An edit targeted a block outside your scope.");
    const { item, selector, parentId } = entry;
    const label = puckConfig.components[item.type as keyof typeof puckConfig.components]?.label ?? item.type;
    if (name === "update_section_props") {
      const { patch } = editToolSchemas.update_section_props.parse(input);
      item.props = { ...item.props, ...updateEditableProps(item.type, item.props, patch) };
      changes.push(`Edit ${label}: ${Object.keys(patch).join(", ")}.`);
      continue;
    }
    if (parentId || (selector.zone && selector.zone !== ROOT_ZONE) || collectEmbeds(item).length) {
      throw new Error("This operation needs a top-level section without protected embeds.");
    }
    const index = selector.index;
    switch (name) {
      case "update_section_design": {
        const { patch } = editToolSchemas.update_section_design.parse(input);
        const background = patch.background;
        if ((background?.type === "image" && !background.images.every(mediaAllowed))
          || (background?.type === "video" && ((background.video.poster && !mediaAllowed(background.video.poster))
            || (background.video.source === "upload" && !mediaAllowed(background.video.uploadUrl))))) {
          throw new Error("Choose media already present in the selected scope.");
        }
        item.props = cleanPhotoCredits({ ...item.props, design: editDesign(record(item.props.design) as BlockDesign, patch, theme, warnings) });
        changes.push(`Style ${label}: ${Object.keys(patch).join(", ")}.`);
        break;
      }
      case "switch_section_design": {
        const { designId } = editToolSchemas.switch_section_design.parse(input);
        const preset = sectionCatalog.find((design) => design.id === designId && design.blockType === item.type);
        if (!preset?.props.design) throw new Error("Choose a catalog design for the same block type.");
        const design = preset.props.design as BlockDesign;
        const existing = record(item.props.design) as BlockDesign;
        item.props = cleanPhotoCredits({ ...item.props, designId,
          ...(preset.props.variant === undefined ? {} : { variant: preset.props.variant }),
          design: editDesign({ ...design, settings: { ...design.settings, ...existing.settings },
            ...((design.background?.type === "image" || design.background?.type === "video") ? { background: existing.background } : {}) },
            {}, theme, warnings),
        });
        changes.push(`Switch ${label} to ${preset.name}.`);
        break;
      }
      case "move_section": {
        const { position } = editToolSchemas.move_section.parse(input);
        const end = next.content.length - 1;
        const to = position === "first" ? 0 : position === "last" ? end : position === "up" ? Math.max(0, index - 1) : Math.min(end, index + 1);
        if (to === index) throw new Error(`${label} is already at that position.`);
        const [block] = next.content.splice(index, 1);
        next.content.splice(to, 0, block);
        changes.push(`Move ${label} ${position}.`);
        break;
      }
      case "duplicate_section": {
        editToolSchemas.duplicate_section.parse(input);
        const block = buildDesignItem({ id: sectionId, blockType: item.type, props: item.props, name: item.type,
          category: "Blank", styles: [], thumbnail: null });
        const design = record(block.props.design) as BlockDesign;
        if (design.settings?.anchorId) delete design.settings.anchorId;
        next.content.splice(index + 1, 0, { ...block, props: { ...block.props, id: String(block.props.id) } });
        changes.push(`Duplicate ${label}.`);
        break;
      }
      case "delete_section":
        editToolSchemas.delete_section.parse(input);
        next.content.splice(index, 1);
        deleted.push(label);
        changes.push(`Delete ${label}.`);
        break;
      default: throw new Error("The assistant returned an unsupported operation.");
    }
  }
  return { data: next, theme: nextTheme, changes, deleted, warnings: [...warnings], insertion };
}
