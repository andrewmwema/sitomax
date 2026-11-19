import type { Field } from "@puckeditor/core";
import { iconValueSchema, type IconValue } from "@/lib/icons";

type Fields = Record<string, Field>;

/** Resolve only declared icon fields, including array entries; never arbitrary prop paths. */
function locateIcon(props: Record<string, unknown>, fields: Fields, path: string) {
  const keys = path.split(".");
  if (!keys.length || keys.some((key) => !key || ["__proto__", "prototype", "constructor"].includes(key))) {
    throw new Error("Invalid icon field.");
  }
  let parent = props;
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const field = fields[key];
    if (!field) break;
    if (index === keys.length - 1 && field.type === "custom" && "aiKind" in field && field.aiKind === "icon") {
      return { parent, key };
    }
    let child = parent[key];
    if (field.type === "array") {
      const position = keys[++index];
      if (!/^(0|[1-9]\d*)$/.test(position) || !Array.isArray(child)) break;
      child = child[Number(position)];
      fields = field.arrayFields as Fields;
    } else if (field.type === "object") fields = field.objectFields as Fields;
    else break;
    if (!child || typeof child !== "object" || Array.isArray(child)) break;
    parent = child as Record<string, unknown>;
  }
  throw new Error("This icon is no longer available. Close the picker and try again.");
}

export function getEditableIcon(props: Record<string, unknown>, fields: Fields, path: string, fallback?: string): IconValue {
  const { parent, key } = locateIcon(props, fields, path);
  const parsed = iconValueSchema.safeParse(parent[key]);
  // Old generated names may already be displayed as the fallback glyph.
  return parsed.success ? parsed.data : iconValueSchema.parse(fallback);
}

export function replaceIcon(props: Record<string, unknown>, fields: Fields, path: string, value: unknown) {
  const icon = iconValueSchema.parse(value);
  const next = structuredClone(props);
  const { parent, key } = locateIcon(next, fields, path);
  parent[key] = icon;
  return next;
}
