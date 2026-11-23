import { z } from "zod";
import { appliedChangesSchema } from "@/lib/ai/agent-apply-types";
import { agentPlanSchema, plainWords, unfinishedPlanSteps } from "@/lib/ai/agent-plan";
import { createAgentReviewPayload } from "@/lib/ai/agent-review";
import { deleteAiAgentThread, getAiAgentRunUsage, loadAiAgentRunState, renameAiAgentThread } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";

const threadIdSchema = z.uuid();
// The two sentences the editor used to append to a message, in the forms it wrote them.
const LEGACY_CONTEXT = /(?:\n\nFocus on this context: (?:Home page|the global site header|selected section ")[^\n]*)?(?:\n\nInsert the new section on (?:the page with pageId|page) [0-9a-f-]{36} at position \d+ \(0 is the top of the page\)\.)?$/;
const threadBodySchema = z.object({ threadId: threadIdSchema });
const renameBodySchema = threadBodySchema.extend({ title: z.string().trim().min(1).max(120) });
const runStateSchema = z.object({
  awaiting: z.object({
    kind: z.enum(["plan", "question", "credit"]),
    payload: z.record(z.string(), z.unknown()),
  }).optional(),
  plan: agentPlanSchema.optional().catch(undefined),
  pauseReason: z.string().optional().catch(undefined),
}).passthrough();

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return supabase;
}

function isSameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const supabase = await authenticatedClient();
  if (!supabase) return Response.json({ message: "Sign in to use the AI agent." }, { status: 401 });
  const query = z.object({ siteId: z.uuid(), threadId: z.uuid().optional() })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return Response.json({ message: "Invalid AI conversation request." }, { status: 400 });

  const { data: threads, error: threadsError } = await supabase.from("ai_agent_threads")
    .select("id, title, updated_at").eq("site_id", query.data.siteId)
    .order("updated_at", { ascending: false }).limit(100);
  if (threadsError) {
    console.error("Could not load AI conversations", { type: threadsError.code ?? "DatabaseError" });
    return Response.json({ message: "Could not load AI conversations." }, { status: 500 });
  }

  if (!query.data.threadId) return Response.json({ threads: threads ?? [], messages: [], latestRun: null });
  const { data: thread, error: threadError } = await supabase.from("ai_agent_threads")
    .select("id").eq("id", query.data.threadId).eq("site_id", query.data.siteId).maybeSingle();
  if (threadError) {
    console.error("Could not verify AI conversation access", { type: threadError.code ?? "DatabaseError" });
    return Response.json({ message: "Could not load this AI conversation." }, { status: 500 });
  }
  if (!thread) return Response.json({ message: "This AI conversation is unavailable." }, { status: 404 });

  const [messageResult, runResult] = await Promise.all([
    supabase.from("ai_agent_messages").select("id, role, content, created_at")
      .eq("thread_id", query.data.threadId).in("role", ["user", "assistant"])
      .order("created_at", { ascending: true }).limit(200),
    supabase.from("ai_agent_runs").select("id, status, changeset")
      .eq("thread_id", query.data.threadId).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (messageResult.error || runResult.error) {
    console.error("Could not load AI conversation history", {
      type: messageResult.error?.code ?? runResult.error?.code ?? "DatabaseError",
    });
    return Response.json({ message: "Could not load this AI conversation." }, { status: 500 });
  }

  let runState = null;
  let usage = null;
  if (runResult.data) {
    try {
      // The saved model conversation and the run's cost are not readable with the user's own access.
      const finished = ["completed", "stopped", "failed"].includes(runResult.data.status);
      const [state, cost] = await Promise.all([
        loadAiAgentRunState(supabase, query.data.threadId, runResult.data.id),
        finished ? getAiAgentRunUsage(supabase, query.data.threadId, runResult.data.id) : null,
      ]);
      runState = runStateSchema.safeParse(state);
      usage = cost;
    } catch (cause) {
      console.error("Could not load AI run state", { type: cause instanceof Error ? cause.name : "Unknown" });
      return Response.json({ message: "Could not load this AI conversation." }, { status: 500 });
    }
  }
  const awaiting = runState?.success && runState.data.awaiting?.kind !== "credit"
    ? runState.data.awaiting ?? null
    : runState?.success && runState.data.awaiting?.kind === "credit"
      ? { kind: "credit" as const, payload: {} }
      : null;
  // A run whose changes were applied shows its applied card, not a second review.
  let applied = null;
  if (runResult.data) {
    const applies = await supabase.rpc("list_ai_agent_applies", { p_site_id: query.data.siteId, p_run_id: runResult.data.id });
    // Before the apply migration runs nothing can have been applied.
    if (applies.error && !["PGRST202", "42883"].includes(applies.error.code)) {
      console.error("Could not load applied AI changes", { type: applies.error.code ?? "DatabaseError" });
      return Response.json({ message: "Could not load this AI conversation." }, { status: 500 });
    }
    const parsed = z.array(appliedChangesSchema).max(1).safeParse(applies.data ?? []);
    if (!parsed.success) {
      console.error("Applied AI changes have an unexpected shape", { type: "ValidationError" });
      return Response.json({ message: "Could not load this AI conversation." }, { status: 500 });
    }
    applied = parsed.data[0] ?? null;
  }
  return Response.json({
    threads: threads ?? [],
    // Messages saved before the editor's context travelled apart from the user's words end with it; it holds ids.
    messages: (messageResult.data ?? []).map((message) => message.role === "user"
      ? { ...message, content: message.content.replace(LEGACY_CONTEXT, "") } : message),
    latestRun: runResult.data ? {
      id: runResult.data.id,
      status: runResult.data.status,
      awaiting: plainWords(awaiting),
      review: applied ? null : createAgentReviewPayload(runResult.data.changeset),
      applied,
      usage,
      // What an approved plan left open, so a paused or finished run never looks complete when it is not.
      unfinished: runState?.success ? plainWords(unfinishedPlanSteps(runState.data.plan)) : [],
      pauseReason: runState?.success && runResult.data.status === "paused" ? runState.data.pauseReason ?? null : null,
    } : null,
  });
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Invalid request origin." }, { status: 403 });
  const supabase = await authenticatedClient();
  if (!supabase) return Response.json({ message: "Sign in to use the AI agent." }, { status: 401 });
  const input = renameBodySchema.safeParse(await readJson(request));
  if (!input.success) return Response.json({ message: "Enter a conversation title of 1-120 characters." }, { status: 400 });
  try {
    const thread = await renameAiAgentThread(supabase, input.data.threadId, input.data.title);
    return Response.json({ thread });
  } catch (cause) {
    console.error("Could not rename AI conversation", { type: cause instanceof Error ? cause.name : "Unknown" });
    const unavailable = cause instanceof Error && cause.message === "This AI conversation is unavailable.";
    return Response.json({ message: unavailable ? cause.message : "Could not rename this AI conversation." }, { status: unavailable ? 404 : 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Invalid request origin." }, { status: 403 });
  const supabase = await authenticatedClient();
  if (!supabase) return Response.json({ message: "Sign in to use the AI agent." }, { status: 401 });
  const input = threadBodySchema.safeParse(await readJson(request));
  if (!input.success) return Response.json({ message: "Invalid AI conversation request." }, { status: 400 });
  try {
    await deleteAiAgentThread(supabase, input.data.threadId);
    return Response.json({ deleted: true });
  } catch (cause) {
    console.error("Could not delete AI conversation", { type: cause instanceof Error ? cause.name : "Unknown" });
    const unavailable = cause instanceof Error && cause.message === "This AI conversation is unavailable.";
    return Response.json({ message: unavailable ? cause.message : "Could not delete this AI conversation." }, { status: unavailable ? 404 : 500 });
  }
}
