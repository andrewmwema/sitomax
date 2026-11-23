import { z } from "zod";
import { executeAgentRequest } from "@/lib/ai/agent";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ message: "Sign in to use the AI agent." }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return Response.json({ message: "AI agent request is too large." }, { status: 413 });
  let raw: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return Response.json({ message: "AI agent request is too large." }, { status: 413 });
    }
    raw = JSON.parse(body);
  } catch {
    return Response.json({ message: "Invalid AI agent request." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();
  let disconnected = false;
  if (request.signal.aborted) abort.abort();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        if (!disconnected) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await executeAgentRequest(supabase, user.id, raw, send, abort.signal);
      } catch (cause) {
        const requestId = crypto.randomUUID();
        console.error("AI agent request failed", { requestId, type: cause instanceof Error ? cause.name : "Unknown" });
        const message = cause instanceof z.ZodError
          ? "The AI agent request is invalid."
          : cause instanceof Error && cause.message.startsWith("A large AI run requires")
            ? cause.message
            : "The AI agent could not complete this request. Your saved drafts are unchanged.";
        send({ type: "error", message, requestId });
      } finally {
        if (!disconnected) controller.close();
      }
    },
    cancel() {
      disconnected = true;
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
