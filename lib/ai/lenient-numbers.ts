import { z } from "zod";

type Issue = z.core.$ZodIssue;
type Path = PropertyKey[];

// "8", "8.5" and "8px". Percentages and other units mean something else and are left alone.
const NUMERIC = /^\s*(-?\d+(?:\.\d+)?)\s*(?:px)?\s*$/i;

/** Where the schema wanted a number, or one of a set of numbers, and got something else. */
function numberIssues(issues: Issue[], prefix: Path = []): { path: Path; allowed?: unknown[] }[] {
  return issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    if (issue.code === "invalid_type" && issue.expected === "number") return [{ path }];
    if (issue.code === "invalid_value" && issue.values.some((value) => typeof value === "number")) return [{ path, allowed: issue.values }];
    // Each branch of a union reports paths from the union's own position.
    if (issue.code === "invalid_union") return issue.errors.flatMap((branch) => numberIssues(branch, path));
    return [];
  });
}

function container(root: unknown, path: Path): { parent: Record<PropertyKey, unknown>; key: PropertyKey } | null {
  let parent = root;
  for (const part of path.slice(0, -1)) {
    if (parent === null || typeof parent !== "object") return null;
    parent = (parent as Record<PropertyKey, unknown>)[part];
  }
  return parent !== null && typeof parent === "object" && path.length
    ? { parent: parent as Record<PropertyKey, unknown>, key: path[path.length - 1] } : null;
}

/**
 * Parses model-written input, reading numeric strings such as "8" or "8px" as
 * numbers wherever the schema asks for a number. Models often write design
 * values the way CSS does; refusing them costs a retry and has made the model
 * drop the rest of an edit. Every other rule of the schema still applies.
 */
export function parseWithNumbers<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  let result = schema.safeParse(input);
  let value: unknown = input;
  // Fixing one value can reveal the next, for example inside a list item that failed as a whole.
  for (let pass = 0; pass < 4 && !result.success; pass++) {
    const next = structuredClone(value);
    let changed = false;
    for (const { path, allowed } of numberIssues(result.error.issues)) {
      const slot = path.length ? container(next, path) : null;
      const text = slot ? slot.parent[slot.key] : undefined;
      const match = typeof text === "string" ? NUMERIC.exec(text) : null;
      if (!slot || !match) continue;
      const number = Number(match[1]);
      if (allowed && !allowed.includes(number)) continue;
      slot.parent[slot.key] = number;
      changed = true;
    }
    if (!changed) break;
    value = next;
    result = schema.safeParse(value);
  }
  if (!result.success) throw result.error;
  return result.data;
}
