import type { Data } from "@puckeditor/core";

/**
 * Catalog designs never invent facts: numbers and claims ship as
 * bracketed placeholders like "[20]+ years" or "[4.9]/5 rating".
 * Before publishing, the editor scans the draft for leftover
 * [brackets] and warns with a link to each affected section.
 */

export type PlaceholderHit = {
  /** Index of the section in data.content (for selection links). */
  index: number;
  blockType: string;
  /** Human label for the section (block label from the Puck config). */
  label: string;
  /** The bracketed snippets still present, deduplicated. */
  snippets: string[];
};

const PLACEHOLDER = /\[[^\[\]]+\]|\{\{[^{}]+\}\}/g;

/** Props that never hold user-facing copy. */
const SKIP_KEYS = new Set(["design", "id"]);

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SKIP_KEYS.has(key)) continue;
      collectStrings(child, out);
    }
  }
}

/** Sections of a draft that still contain [placeholder] text. */
export function findUnreplacedPlaceholders(
  data: Partial<Data>,
  blockLabels: Record<string, string | undefined> = {},
): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  (data.content ?? []).forEach((item, index) => {
    const strings: string[] = [];
    collectStrings(item.props, strings);
    const snippets = new Set<string>();
    for (const text of strings) {
      for (const match of text.match(PLACEHOLDER) ?? []) snippets.add(match);
    }
    if (snippets.size > 0) {
      hits.push({
        index,
        blockType: item.type as string,
        label: blockLabels[item.type as string] ?? (item.type as string),
        snippets: [...snippets].slice(0, 4),
      });
    }
  });
  return hits;
}
