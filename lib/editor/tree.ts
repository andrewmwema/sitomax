import { z } from "zod";
import type { Data, UiState } from "@puckeditor/core";
import { puckConfig } from "@/lib/puck/config";
import { ELEMENT_TYPES } from "@/lib/layout/structure";

export const ROOT_ZONE = "root:default-zone";
type ItemSelector = NonNullable<UiState["itemSelector"]>;
export type EditorItem = { type: string; props: { id: string; [key: string]: unknown } };
export type TreeEntry = { item: EditorItem; selector: ItemSelector; parentId: string | null };

export function editorTree(data: Data): TreeEntry[] {
  const result: TreeEntry[] = [];
  const walk = (items: unknown, zone: string, parentId: string | null) => {
    if (!Array.isArray(items)) return;
    items.forEach((item: EditorItem, index) => {
      if (!item?.props?.id) return;
      result.push({ item, selector: { index, zone }, parentId });
      const fields = puckConfig.components[item.type as keyof typeof puckConfig.components]?.fields;
      for (const [key, field] of Object.entries(fields ?? {})) {
        if (field.type === "slot") walk(item.props[key], `${item.props.id}:${key}`, item.props.id);
      }
    });
  };
  walk(data.content, ROOT_ZONE, null);
  for (const [zone, items] of Object.entries(data.zones ?? {})) {
    walk(items, zone, zone.slice(0, zone.lastIndexOf(":")));
  }
  return result;
}

export function selectionPath(entries: TreeEntry[], id: string): TreeEntry[] {
  const path: TreeEntry[] = [];
  let entry = entries.find((entry) => entry.item.props.id === id);
  while (entry && !path.includes(entry)) {
    path.unshift(entry);
    entry = entries.find((parent) => parent.item.props.id === entry?.parentId);
  }
  return path;
}

export function insertAt(data: Data, zone: string, index: number, item: EditorItem): Data {
  const next = structuredClone(data);
  if (zone === ROOT_ZONE) next.content.splice(index, 0, item);
  else if (next.zones?.[zone]) next.zones[zone].splice(index, 0, item);
  else {
    const split = zone.lastIndexOf(":");
    const parent = editorTree(next).find((entry) => entry.item.props.id === zone.slice(0, split));
    const slot = parent?.item.props[zone.slice(split + 1)];
    if (!Array.isArray(slot)) throw new Error("The destination layout no longer exists.");
    slot.splice(index, 0, item);
  }
  return next;
}

export function canPlace(type: string, parentType?: string, slot?: string): boolean {
  if (parentType === "Section") return type === "Row" && slot === "rows";
  if (parentType === "Column") return (ELEMENT_TYPES as readonly string[]).includes(type) && slot === "content";
  if (parentType) return false;
  return type === "Section" || !(["Row", "Column", ...ELEMENT_TYPES] as readonly string[]).includes(type);
}

const itemSchema = z.object({
  type: z.string().refine((type) => Object.hasOwn(puckConfig.components, type)),
  props: z.record(z.string(), z.unknown()).and(z.object({ id: z.string() })),
});

export function readClipboard(raw: string, accountId: string, userId: string, isSuperAdmin: boolean): EditorItem {
  if (raw.length > 1_000_000) throw new Error("The copied block is too large.");
  const parsed = z.object({ accountId: z.literal(accountId), userId: z.literal(userId), item: itemSchema }).parse(JSON.parse(raw));
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.type === "string" && record.props) {
      const item = itemSchema.parse(record);
      if (!isSuperAdmin && item.type === "Embed") throw new Error("Only your agency can paste an Embed.");
    }
    Object.values(record).forEach(walk);
  };
  walk(parsed.item);
  return parsed.item;
}
