import { after } from "next/server";
import { brand } from "@/lib/brand";
import { parseLeadInbound } from "@/lib/leads/inbound";
import { forwardLeadReplies, inboundReplyConfig } from "@/lib/leads/reply-mail";
import { equalSecret, replyAddress } from "@/lib/leads/reply-token";
import { leadReplyWorker } from "@/lib/leads/reply-worker";
import { readTextBody } from "@/lib/request-body";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (host.toLowerCase() !== new URL(brand.appUrl).host.toLowerCase()) return new Response("Not found", { status: 404 });
  const user = process.env.POSTMARK_INBOUND_WEBHOOK_USER;
  const password = process.env.POSTMARK_INBOUND_WEBHOOK_PASSWORD;
  const config = inboundReplyConfig();
  if (!user || !password || !config) {
    console.error("Lead inbound email is not configured");
    return new Response("Temporarily unavailable", { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  const value = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(auth)?.[1];
  if (!value || !equalSecret(value, Buffer.from(`${user}:${password}`).toString("base64"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = await readTextBody(request, 8_000_000);
  if (body === null) {
    console.warn("Ignored oversized lead inbound webhook");
    return new Response("Ignored");
  }
  let raw: unknown;
  try { raw = JSON.parse(body); }
  catch { console.warn("Ignored malformed lead inbound webhook"); return new Response("Ignored"); }
  const reply = parseLeadInbound(raw, config.domain, config.tokenSecret);
  if (!reply) { console.warn("Ignored invalid lead inbound recipient or payload"); return new Response("Ignored"); }
  try {
    const { client, secret } = leadReplyWorker();
    const saved = await client.rpc("store_lead_inbound", {
      p_secret: secret, p_lead: reply.leadId, p_from: reply.from,
      p_to: replyAddress(reply.leadId, config.domain, config.tokenSecret), p_subject: reply.subject,
      p_text: reply.reply || reply.fullText, p_html: reply.html, p_full_text: reply.fullText, p_provider_id: reply.providerId,
      p_in_reply_to: reply.inReplyTo, p_auto: reply.auto, p_attachments: reply.attachments,
    });
    if (saved.error) {
      console.error("Could not save an inbound lead reply", { code: saved.error.code });
      return new Response("Temporarily unavailable", { status: 503 });
    }
    if (typeof saved.data === "string" && !reply.auto) {
      const messageId = saved.data;
      after(async () => {
        try { await forwardLeadReplies(messageId); }
        catch { console.error("Reply was saved but could not be forwarded immediately", { messageId }); }
      });
    } else if (saved.data === null) console.info("Ignored duplicate or unmatched lead inbound message");
    return new Response("OK");
  } catch {
    console.error("Could not process an inbound lead reply");
    return new Response("Temporarily unavailable", { status: 503 });
  }
}
