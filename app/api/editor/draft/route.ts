import { z } from "zod";
import { saveAiEdit, savePageDraft } from "@/app/editor/[pageId]/actions";
import { createClient } from "@/lib/supabase/server";
import { readTextBody } from "@/lib/request-body";
import { themeSchema } from "@/lib/theme/schema";
import { isSameOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const inputSchema = z.strictObject({
  pageId: z.uuid(), data: z.unknown(), expectedVersion: z.uuid(),
  theme: themeSchema.optional(), expectedTheme: themeSchema.optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ status: "error", message: "Invalid origin." }, { status: 403, headers });
  }
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ status: "error", message: "Sign in before saving." }, { status: 401, headers });
  const body = await readTextBody(request, 1024 * 1024);
  if (body === null) return Response.json({ status: "error", message: "Draft too large." }, { status: 413, headers });
  let json: unknown;
  try { json = JSON.parse(body); }
  catch { return Response.json({ status: "error", message: "Invalid draft." }, { status: 400, headers }); }
  const parsed = inputSchema.safeParse(json);
  if (!parsed.success) return Response.json({ status: "error", message: "Invalid draft." }, { status: 400, headers });
  const { pageId, data, expectedVersion, theme, expectedTheme } = parsed.data;
  const result = theme
    ? await saveAiEdit(pageId, data, { snapshot: false, theme, expectedTheme }, expectedVersion)
    : await savePageDraft(pageId, data, expectedVersion);
  return Response.json(result, { status: result.status === "success" ? 200 : result.retryable ? 503 : 409, headers });
}
