import "server-only";
import { z } from "zod";

export const pageVersionSchema = z.uuid();
export type EditorSaveResult =
  | { status: "success"; message: string; version: string }
  | { status: "error"; message: string; conflict?: boolean };

export function versionedPageData<T extends { root: { props?: Record<string, unknown> } }>(data: T, expected: string) {
  const version = crypto.randomUUID();
  return {
    version,
    data: { ...data, root: { ...data.root, props: {
      ...data.root.props, __expectedPageVersion: pageVersionSchema.parse(expected), __nextPageVersion: version,
    } } },
  };
}
