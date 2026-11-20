import { brand } from "@/lib/brand";
import { leadReplyWorker } from "@/lib/leads/reply-worker";
import { equalSecret } from "@/lib/leads/reply-token";
import { parsePostmarkEvent } from "@/lib/leads/postmark-events";
import { readTextBody } from "@/lib/request-body";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (host.toLowerCase() !== new URL(brand.appUrl).host.toLowerCase()) return new Response("Not found", { status: 404 });
  const user = process.env.POSTMARK_INBOUND_WEBHOOK_USER;
  const password = process.env.POSTMARK_INBOUND_WEBHOOK_PASSWORD;
  if (!user || !password) {
    console.error("Postmark email events are not configured");
    return new Response("Temporarily unavailable", { status: 503 });
  }
  const encoded = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!encoded || !equalSecret(encoded, Buffer.from(`${user}:${password}`).toString("base64"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = await readTextBody(request, 16_384);
  if (body === null) {
    console.warn("Ignored oversized Postmark event");
    return new Response("OK");
  }
  let raw: unknown;
  try { raw = JSON.parse(body); }
  catch { console.warn("Ignored malformed Postmark event"); return new Response("OK"); }
  const event = parsePostmarkEvent(raw);
  if (!event) {
    console.warn("Ignored invalid Postmark event");
    return new Response("OK");
  }
  if (event.ignored) return new Response("OK");
  try {
    const { client, secret } = leadReplyWorker();
    const { error } = await client.rpc("record_postmark_email_event", {
      p_secret: secret, p_email: event.email, p_event_type: event.type,
      p_reason: event.reason, p_message_stream: event.messageStream, p_occurred_at: event.occurredAt,
    });
    if (error) console.error("Could not save an authenticated Postmark delivery event", { code: error.code });
  } catch {
    console.error("Could not process an authenticated Postmark delivery event");
  }
  return new Response("OK");
}
