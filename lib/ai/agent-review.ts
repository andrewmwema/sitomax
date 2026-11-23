import { z } from "zod";

type PathPart = string | { id: string };
type Value = { present: false } | { present: true; value: unknown };

type ValuePatch = {
  path: PathPart[];
  before: Value;
  after: Value;
};
/**
 * Structure change to an array of items with stable IDs. Surviving items are
 * patched separately, so adding, moving or removing an item does not conflict
 * with text edits elsewhere in the same array.
 */
type OrderPatch = {
  path: PathPart[];
  order: { before: string[]; after: string[] };
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
};
export type ReviewPatch = ValuePatch | OrderPatch;

const valueSchema = z.discriminatedUnion("present", [
  z.strictObject({ present: z.literal(false) }),
  z.strictObject({ present: z.literal(true), value: z.unknown() }),
]);
const pathSchema = z.array(z.union([z.string(), z.strictObject({ id: z.string() })])).min(1);
const reviewPatchSchema = z.union([
  z.strictObject({ path: pathSchema, before: valueSchema, after: valueSchema }),
  z.strictObject({
    path: pathSchema,
    order: z.strictObject({ before: z.array(z.string()), after: z.array(z.string()) }),
    added: z.record(z.string(), z.unknown()),
    removed: z.record(z.string(), z.unknown()),
  }),
]);
const changeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string(),
  pageId: z.string().optional(),
  patches: z.array(reviewPatchSchema),
});
const snapshotSchema = z.strictObject({
  theme: z.unknown(),
  header: z.unknown(),
  footer: z.unknown(),
  pages: z.array(z.unknown()),
});
export const agentReviewPayloadSchema = z.strictObject({
  changes: z.array(changeSchema),
  baseline: snapshotSchema,
  working: snapshotSchema,
  /** What the quality check repaired, and what is left for the user to look at. */
  quality: z.strictObject({ fixed: z.array(z.string()), notes: z.array(z.string()) }).optional(),
});
export type AgentReviewPayload = z.infer<typeof agentReviewPayloadSchema>;
export type AgentReviewChange = AgentReviewPayload["changes"][number];
export type AgentReviewDecision = "kept" | "undone";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function jsonEqual(left: unknown, right: unknown): boolean {
  return equal(left, right);
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => equal(item, right[index]));
  }
  if (isObject(left) && isObject(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
  }
  return false;
}

/** Footer fields that differ. The footer is one shared block repeated on every page that shows it. */
export function footerChanges(before: unknown, after: unknown): Record<string, unknown> {
  if (!isObject(after)) return {};
  const base = isObject(before) ? before : {};
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => key !== "id" && !equal(base[key], value)));
}

function itemId(item: unknown): string | undefined {
  if (!isObject(item)) return undefined;
  if (typeof item.id === "string") return item.id;
  return isObject(item.props) && typeof item.props.id === "string" ? item.props.id : undefined;
}

function stableIds(items: unknown[]): string[] | null {
  const ids = items.map(itemId);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return null;
  return ids as string[];
}

function reviewSnapshot(value: unknown) {
  if (!isObject(value) || !Array.isArray(value.pages)) return null;
  return {
    theme: value.theme,
    header: value.header,
    footer: value.footer,
    pages: value.pages,
  };
}

export function createAgentReviewPayload(value: unknown): AgentReviewPayload | null {
  if (!isObject(value) || !Array.isArray(value.changes)) return null;
  const baseline = reviewSnapshot(value.baseline);
  const working = reviewSnapshot(value.working);
  if (!baseline || !working) return null;

  const changes = value.changes.map((change) => changeSchema.safeParse(change));
  if (changes.some((change) => !change.success)) return null;
  const quality = isObject(value.quality) ? { quality: value.quality } : {};
  const parsed = agentReviewPayloadSchema.safeParse({
    baseline,
    working,
    changes: changes.map((change) => change.success ? change.data : null),
    ...quality,
  });
  return parsed.success ? parsed.data : null;
}

export function reviewPatches(before: unknown, after: unknown): ReviewPatch[] {
  const patches: ReviewPatch[] = [];
  function visit(oldValue: Value, newValue: Value, path: PathPart[]) {
    if (oldValue.present && newValue.present) {
      if (equal(oldValue.value, newValue.value)) return;
      if (isObject(oldValue.value) && isObject(newValue.value)) {
        const oldObject = oldValue.value;
        const newObject = newValue.value;
        for (const key of new Set([...Object.keys(oldObject), ...Object.keys(newObject)])) {
          visit(Object.hasOwn(oldObject, key) ? { present: true, value: oldObject[key] } : { present: false },
            Object.hasOwn(newObject, key) ? { present: true, value: newObject[key] } : { present: false },
            [...path, key]);
        }
        return;
      }
      if (Array.isArray(oldValue.value) && Array.isArray(newValue.value)) {
        const oldItems = oldValue.value;
        const newItems = newValue.value;
        const oldIds = stableIds(oldItems);
        const newIds = stableIds(newItems);
        if (oldIds && newIds) {
          if (!equal(oldIds, newIds)) {
            const only = (ids: string[], other: string[], items: unknown[]) => Object.fromEntries(
              ids.flatMap((id, index) => other.includes(id) ? [] : [[id, structuredClone(items[index])]]));
            patches.push({
              path, order: { before: oldIds, after: newIds },
              added: only(newIds, oldIds, newItems), removed: only(oldIds, newIds, oldItems),
            });
          }
          oldIds.forEach((id, index) => {
            const next = newIds.indexOf(id);
            if (next >= 0) visit({ present: true, value: oldItems[index] }, { present: true, value: newItems[next] }, [...path, { id }]);
          });
          return;
        }
      }
    }
    patches.push({ path, before: structuredClone(oldValue), after: structuredClone(newValue) });
  }
  visit({ present: true, value: before }, { present: true, value: after }, []);
  return patches;
}

function resolveParent(root: unknown, path: PathPart[]) {
  if (!path.length) throw new Error("Cannot replace the entire site snapshot.");
  let parent = root;
  for (const part of path.slice(0, -1)) {
    if (typeof part === "string" && isObject(parent) && Object.hasOwn(parent, part)) {
      parent = parent[part];
    } else if (typeof part !== "string" && Array.isArray(parent)) {
      const matches = parent.filter((item) => itemId(item) === part.id);
      if (matches.length !== 1) throw new Error("The draft changed. Review this change again.");
      parent = matches[0];
    } else throw new Error("The draft changed. Review this change again.");
  }
  const key = path[path.length - 1];
  if (typeof key !== "string" || !isObject(parent)) throw new Error("Invalid changeset path.");
  return { parent, key };
}

function readPath(root: unknown, path: PathPart[]): Value {
  const { parent, key } = resolveParent(root, path);
  return Object.hasOwn(parent, key) ? { present: true, value: parent[key] } : { present: false };
}

const CHANGED = "The draft changed. Review this change again.";

function applyOrderPatch(root: unknown, patch: OrderPatch) {
  const { parent, key } = resolveParent(root, patch.path);
  const current = Object.hasOwn(parent, key) ? parent[key] : undefined;
  const ids = Array.isArray(current) ? stableIds(current) : null;
  if (!Array.isArray(current) || !ids) throw new Error(CHANGED);
  const items = new Map(ids.map((id, index) => [id, current[index]]));
  if (Object.keys(patch.added).some((id) => items.has(id))) throw new Error(CHANGED);
  for (const [id, item] of Object.entries(patch.removed)) {
    if (items.has(id) && !equal(items.get(id), item)) throw new Error(CHANGED);
  }
  const { before, after } = patch.order;
  let next: string[];
  if (equal(before.filter((id) => after.includes(id)), after.filter((id) => before.includes(id)))) {
    // Only additions and removals: merge them into the current order.
    next = ids.filter((id) => !Object.hasOwn(patch.removed, id));
    after.forEach((id, index) => {
      if (!Object.hasOwn(patch.added, id)) return;
      const anchor = index > 0 ? next.indexOf(after[index - 1]) : -1;
      if (index > 0 && anchor < 0) throw new Error(CHANGED);
      next.splice(anchor + 1, 0, id);
    });
  } else {
    if (!equal(ids, before)) throw new Error(CHANGED);
    next = after;
  }
  Object.defineProperty(parent, key, {
    value: next.map((id) => Object.hasOwn(patch.added, id) ? structuredClone(patch.added[id]) : items.get(id)),
    writable: true, enumerable: true, configurable: true,
  });
}

function applyPatch(root: unknown, patch: ReviewPatch) {
  if ("order" in patch) return applyOrderPatch(root, patch);
  const { parent, key } = resolveParent(root, patch.path);
  const present = Object.hasOwn(parent, key);
  if (present !== patch.before.present || (present && patch.before.present && !equal(parent[key], patch.before.value))) {
    throw new Error("The draft changed. Review this change again.");
  }
  if (patch.after.present) {
    Object.defineProperty(parent, key, { value: structuredClone(patch.after.value), writable: true, enumerable: true, configurable: true });
  } else {
    delete parent[key];
  }
}

export function applyReviewPatches<T>(source: T, patches: ReviewPatch[]): T {
  const result: unknown = structuredClone(source);
  for (const patch of patches) applyPatch(result, patch);
  return result as T;
}

export function previewAgentReview(
  payload: AgentReviewPayload,
  decisions: Record<string, AgentReviewDecision>,
  throughIndex = payload.changes.length - 1,
) {
  const snapshot = structuredClone(payload.baseline);
  try {
    payload.changes.slice(0, throughIndex + 1).forEach((change) => {
      if (decisions[change.id] === "undone" || change.kind === "create_blog_post" || change.kind === "update_blog_post") return;
      for (const patch of change.patches) {
        if ("order" in patch) { applyPatch(snapshot, patch); continue; }
        const current = readPath(snapshot, patch.path);
        const matchesBefore = current.present === patch.before.present &&
          (!current.present || !patch.before.present || equal(current.value, patch.before.value));
        if (!matchesBefore) {
          const currentValue = current.present ? current.value : undefined;
          const expected = patch.before.present ? patch.before.value : undefined;
          const nextValue = patch.after.present ? patch.after.value : undefined;
          if ([currentValue, expected, nextValue].some((item) => Array.isArray(item) || isObject(item))) {
            throw new Error("Some changes depend on an undone structural change. Keep that change or undo its dependent changes.");
          }
          applyPatch(snapshot, { ...patch, before: current });
        } else {
          applyPatch(snapshot, patch);
        }
      }
    });
    return { snapshot, error: null };
  } catch (cause) {
    return {
      snapshot: null,
      error: cause instanceof Error && cause.message.includes("draft changed")
        ? "Some changes depend on an undone change. Keep that change or undo its dependent changes."
        : cause instanceof Error ? cause.message : "The preview could not be rebuilt.",
    };
  }
}

export function undoReviewPatches<T>(source: T, patches: ReviewPatch[]): T {
  return applyReviewPatches(source, [...patches].reverse().map((patch): ReviewPatch => "order" in patch
    ? { path: patch.path, order: { before: patch.order.after, after: patch.order.before }, added: patch.removed, removed: patch.added }
    : { path: patch.path, before: patch.after, after: patch.before }));
}
