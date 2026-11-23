import { z } from "zod";
import { readTextBody } from "@/lib/request-body";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.strictObject({ pageId: z.uuid(), sessionId: z.uuid() });

// Browsers set Sec-Fetch-Site themselves and pages cannot forge it. It is checked
// first because behind a forwarding proxy (a dev tunnel) request.url carries the
// internal host, so comparing it with Origin would reject the editor's own beacon.
function isSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";
  return request.headers.get("origin") === new URL(request.url).origin;
}

/**
 * Closes an editor presence session when its tab is closed or reloaded. The
 * editor posts here with `navigator.sendBeacon`, because a Server Action cannot
 * be sent while a page unloads. The database only closes the caller's own session.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const text = await readTextBody(request, 1024);
  if (text === null) return new Response(null, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) return new Response(null, { status: 400 });

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response(null, { status: 401 });
  const { error } = await supabase.rpc("heartbeat_page_editor", {
    p_page_id: body.data.pageId, p_session_id: body.data.sessionId, p_close: true,
  });
  if (error) {
    console.error("Could not close editor presence", { code: error.code });
    return new Response(null, { status: error.code === "42501" ? 404 : 500 });
  }
  return new Response(null, { status: 204 });
}
