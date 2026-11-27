import type { Data } from "@puckeditor/core";

// Canonical JSON is a collision-free fingerprint; object identity/key order
// and request-only concurrency tokens must not turn into edits.
export function draftFingerprint(data: Data): string {
  const props: Record<string, unknown> = { ...data.root.props };
  delete props.__expectedHeader;
  delete props.__expectedPageVersion;
  delete props.__nextPageVersion;
  return JSON.stringify({ ...data, root: { ...data.root, props } }, (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  });
}
