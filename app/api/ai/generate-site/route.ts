import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildGeneratedSite, SiteGenerationError } from "@/lib/ai/generate-site";
import { AiProviderError, aiErrorMessage } from "@/lib/ai/provider-error";

export const runtime = "nodejs";
export const maxDuration = 300;

/** The streamed transport and Server Action share exactly the same pipeline. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return Response.json({ message: "Invalid generation request." }, { status: 400 }); }
  let disconnected = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        if (!disconnected) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const result = await buildGeneratedSite(raw, (progress) => send({ type: "progress", ...progress }));
        revalidatePath("/dashboard");
        revalidatePath(`/dashboard/sites/${result.siteId}`);
        send({ type: "result", ...result });
      } catch (cause) {
        console.error("Streamed site generation stopped", { type: cause instanceof Error ? cause.name : "Unknown" });
        const fallback = cause instanceof SiteGenerationError || cause instanceof AiProviderError ? cause.message
          : cause instanceof z.ZodError ? "Check the business details and replacement confirmation."
            : "Generation stopped. Check your drafts and contact your agency before retrying.";
        send({ type: "error", message: await aiErrorMessage(cause, fallback) });
      } finally {
        if (!disconnected) controller.close();
      }
    },
    cancel() { disconnected = true; },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no",
  } });
}
