import { graderRpc } from "@/lib/grader/worker";
import { verifyUnsubscribeToken } from "@/lib/grader/unsubscribe";

export const runtime = "nodejs";
const headers = {
  "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};
function page(body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Website grader email preferences</title></head><body><main>${body}</main></body></html>`, { status, headers });
}
function token(request: Request) {
  return new URL(request.url).searchParams.get("token");
}
export async function GET(request: Request) {
  try {
    if (!verifyUnsubscribeToken(token(request))) return page("<h1>Invalid unsubscribe link</h1>", 400);
    return page('<h1>Unsubscribe from website grader emails</h1><p>Confirm to stop receiving grader tips and offers.</p><form method="post"><button type="submit">Unsubscribe</button></form>');
  } catch {
    console.error("Grader unsubscribe is not configured");
    return page("<h1>Unsubscribe is temporarily unavailable</h1><p>Please try again later.</p>", 503);
  }
}
export async function POST(request: Request) {
  try {
    const id = verifyUnsubscribeToken(token(request));
    if (!id) return page("<h1>Invalid unsubscribe link</h1>", 400);
    const result = await graderRpc("grader_unsubscribe", { p_unlock: id });
    if (result !== true) return page("<h1>Invalid unsubscribe link</h1>", 400);
    return page("<h1>You are unsubscribed</h1><p>You will no longer receive website grader tips and offers.</p>");
  } catch {
    console.error("Could not unsubscribe grader recipient");
    return page("<h1>Unsubscribe is temporarily unavailable</h1><p>Please try again later.</p>", 503);
  }
}
