type PathPart = string | { id: string };
type Value = { present: false } | { present: true; value: unknown };

export type ReviewPatch = {
  path: PathPart[];
  before: Value;
  after: Value;
};

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

export function applyReviewPatches<T>(source: T, patches: ReviewPatch[]): T {
  const result: unknown = structuredClone(source);
  for (const patch of patches) {
    if (!patch.path.length) throw new Error("Cannot replace the entire site snapshot.");
    let parent: unknown = result;
    for (const part of patch.path.slice(0, -1)) {
      if (typeof part === "string" && isObject(parent) && Object.hasOwn(parent, part)) {
        parent = parent[part];
      } else if (typeof part !== "string" && Array.isArray(parent)) {
        const matches = parent.filter((item) => itemId(item) === part.id);
        if (matches.length !== 1) throw new Error("The draft changed. Review this change again.");
        parent = matches[0];
      } else throw new Error("The draft changed. Review this change again.");
    }
    const key = patch.path[patch.path.length - 1];
    if (typeof key !== "string" || !isObject(parent)) throw new Error("Invalid changeset path.");
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
  return result as T;
}

export function undoReviewPatches<T>(source: T, patches: ReviewPatch[]): T {
  return applyReviewPatches(source, [...patches].reverse().map(({ path, before, after }) => ({
    path, before: after, after: before,
  })));
}
