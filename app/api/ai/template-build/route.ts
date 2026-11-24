import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildTemplateSite, recommendTemplateBuild } from "@/lib/ai/template-build";
import { cancelTemplateBuild } from "@/lib/ai/usage";
import { AiUserError } from "@/lib/ai/errors";
import { AiProviderError, aiErrorMessage } from "@/lib/ai/provider-error";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return Response.json({ message: "Invalid request." }, { status: 400 }); }
  const parsed = z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("recommend"), input: z.unknown() }),
    z.strictObject({ mode: z.literal("build"), input: z.unknown() }),
    z.strictObject({ mode: z.literal("cancel"), accountId: z.uuid(), generationId: z.uuid() }),
  ]).safeParse(raw);
  if (!parsed.success) return Response.json({ message: "Invalid request." }, { status: 400 });
  const requestId = crypto.randomUUID();
  const message = async (cause: unknown) => {
    console.error("Template build stopped", { requestId, type: cause instanceof Error ? cause.name : "Unknown" });
    const fallback = cause instanceof AiUserError || cause instanceof AiProviderError ? cause.message
      : cause instanceof z.ZodError ? "Check your business and site details."
        : "The request stopped. Check your drafts and contact your agency before retrying.";
    return aiErrorMessage(cause, fallback);
  };
  if (parsed.data.mode !== "build") {
    try {
      if (parsed.data.mode === "cancel") {
        await cancelTemplateBuild(parsed.data.accountId, parsed.data.generationId);
        return Response.json({ cancelled: true });
      }
      return Response.json(await recommendTemplateBuild(parsed.data.input, requestId));
    } catch (cause) {
      return Response.json({ message: await message(cause), requestId }, { status: 400 });
    }
  }
  const input = parsed.data.input;
  let disconnected = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        if (!disconnected) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const result = await buildTemplateSite(input, (progress) => send({ type: "progress", ...progress }), requestId);
        revalidatePath("/dashboard");
        revalidatePath(`/dashboard/sites/${result.siteId}`);
        send({ type: "result", ...result });
      } catch (cause) { send({ type: "error", message: await message(cause) }); }
      finally { if (!disconnected) controller.close(); }
    },
    cancel() { disconnected = true; },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson", "Cache-Control": "no-store",
    "X-Accel-Buffering": "no", "X-Request-ID": requestId,
  } });
}
