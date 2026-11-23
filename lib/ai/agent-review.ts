import { z } from "zod";

type PathPart = string | { id: string };
type Value = { present: false } | { present: true; value: unknown };

export type ReviewPatch = {
  path: PathPart[];
  before: Value;
  after: Value;
};

const valueSchema = z.discriminatedUnion("present", [
  z.strictObject({ present: z.literal(false) }),
  z.strictObject({ present: z.literal(true), value: z.unknown() }),
]);
const reviewPatchSchema = z.strictObject({
  path: z.array(z.union([z.string(), z.strictObject({ id: z.string() })])).min(1),
  before: valueSchema,
  after: valueSchema,
});
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
});
export type AgentReviewPayload = z.infer<typeof agentReviewPayloadSchema>;
export type AgentReviewDecision = "kept" | "undone";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
  const parsed = agentReviewPayloadSchema.safeParse({
    baseline,
    working,
    changes: changes.map((change) => change.success ? change.data : null),
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
        const oldIds = stableIds(oldValue.value);
        const newIds = stableIds(newValue.value);
        if (oldIds && newIds && equal(oldIds, newIds)) {
          oldIds.forEach((id, index) => visit(
            { present: true, value: (oldValue.value as unknown[])[index] },
            { present: true, value: (newValue.value as unknown[])[index] },
            [...path, { id }],
          ));
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

function applyPatch(root: unknown, patch: ReviewPatch) {
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
  return applyReviewPatches(source, [...patches].reverse().map(({ path, before, after }) => ({
    path, before: after, after: before,
  })));
}
