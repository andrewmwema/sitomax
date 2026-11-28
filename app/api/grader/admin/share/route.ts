import { z } from "zod";
import { graderAdmin } from "@/lib/grader/admin-auth";
import { graderSlugSchema } from "@/lib/grader/public-report";
import { readTextBody } from "@/lib/request-body";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const schema = z.strictObject({ slug: graderSlugSchema, disabled: z.boolean() });

export async function POST(request: Request) {
  const auth = await graderAdmin();
  if (!auth.ok) return Response.json({ error: "Not authorized." }, { status: auth.status, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid origin." }, { status: 403, headers });
  }
  const body = await readTextBody(request, 1024);
  if (body === null) return Response.json({ error: "Request too large." }, { status: 413, headers });
  let parsed: z.infer<typeof schema>;
  try { parsed = schema.parse(JSON.parse(body)); }
  catch { return Response.json({ error: "Invalid request." }, { status: 400, headers }); }
  const { data, error } = await auth.supabase.rpc("grader_set_share_disabled", { p_slug: parsed.slug, p_disabled: parsed.disabled });
  if (error) {
    console.error("Could not update grader share link", { code: error.code });
    return Response.json({ error: "Couldn't update the share link." }, { status: 503, headers });
  }
  if (data !== true) return Response.json({ error: "Not found." }, { status: 404, headers });
  return Response.json({ ok: true, disabled: parsed.disabled }, { headers });
}
