import "server-only";
import { z } from "zod";

export const pageVersionSchema = z.uuid();
export type EditorSaveResult =
  | { status: "success"; message: string; version: string }
  | { status: "error"; message: string; conflict?: boolean; retryable?: boolean };

export function retryableEditorError(code: string | undefined, status?: number): boolean {
  return !code || (status !== undefined && status >= 500) || (
    ["PGRST002", "PGRST003", "55P03", "57014", "53300", "57P01", "57P02", "57P03"].includes(code) ||
    code.startsWith("08")
  );
}

export function versionedPageData<T extends { root: { props?: Record<string, unknown> } }>(data: T, expected: string) {
  const version = crypto.randomUUID();
  return {
    version,
    data: { ...data, root: { ...data.root, props: {
      ...data.root.props, __expectedPageVersion: pageVersionSchema.parse(expected), __nextPageVersion: version,
    } } },
  };
}
