import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PLAN_SITE_TOOL } from "./site-schemas";

export type SiteTool = Omit<typeof PLAN_SITE_TOOL, "strict"> & { strict: boolean };
type SiteToolResponse = Anthropic.Message & { _request_id?: string | null };
export type SiteToolCall = (tool: SiteTool, messages: Anthropic.MessageParam[]) => Promise<SiteToolResponse>;
type Trace = { requestId: string; generationId: string; contract: string; page?: string };

export function validationMessage(error: z.ZodError) {
  return error.issues.map(({ path, message }) => `${path.join(".") || "(root)"}: ${message}`).join("\n").slice(0, 8000);
}

export async function runSiteTool<T>(
  call: SiteToolCall, tool: SiteTool, schema: z.ZodType<T>, messages: Anthropic.MessageParam[], repairAttempt = false, trace?: Trace,
) {
  const metadata = { tool: tool.name, strict: tool.strict, schemaBytes: Buffer.byteLength(JSON.stringify(tool.input_schema)), repairAttempt };
  let response: SiteToolResponse;
  try {
    response = await call(tool, messages);
  } catch (error) {
    console.info("AI site tool call", { ...metadata, stop_reason: null, repairNeeded: null });
    if (trace) console.warn("AI custom generation attempt", { ...trace, ...metadata, attempt: repairAttempt ? 2 : 1, outcome: "request_failed" });
    throw error;
  }
  const blocks = response.content.filter((block) => block.type === "tool_use");
  const matchingCall = response.stop_reason === "tool_use" && blocks.length === 1 && blocks[0].name === tool.name;
  const result = schema.safeParse(matchingCall ? blocks[0].input : undefined);
  const outcome = result.success ? "valid" : matchingCall ? "validation_failed"
    : response.stop_reason === "max_tokens" || response.stop_reason === "model_context_window_exceeded" ? "incomplete"
      : response.stop_reason === "refusal" ? "refused" : "missing_tool";
  if (trace) {
    console.info("AI custom generation attempt", {
      ...trace, ...metadata, attempt: repairAttempt ? 2 : 1, outcome, stopReason: response.stop_reason,
      providerRequestId: response._request_id ?? null, outputTokens: response.usage?.output_tokens,
      toolCalls: blocks.length, inputType: matchingCall ? (Array.isArray(blocks[0].input) ? "array" : typeof blocks[0].input) : null,
      issueCount: matchingCall && !result.success ? result.error.issues.length : 0,
      issues: matchingCall && !result.success
        ? result.error.issues.slice(0, 20).map(({ path, code }) => ({ path: path.map(String), code })) : [],
    });
  }
  console.info("AI site tool call", { ...metadata, stop_reason: response.stop_reason, repairNeeded: !result.success && !repairAttempt && (!trace || outcome !== "refused") });
  return { response, blocks, result, matchingCall, outcome };
}

export async function fillSiteTool<T>(call: SiteToolCall, tool: SiteTool, schema: z.ZodType<T>, prompt: string, trace?: Trace) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const first = await runSiteTool(call, tool, schema, messages, false, trace);
  if (first.result.success || (trace && first.outcome === "refused")) return first;
  const errors = first.matchingCall ? `Validation errors:\n${validationMessage(first.result.error)}`
    : `Expected exactly one ${tool.name} call; the previous response did not provide a complete matching call.`;
  const instructions = `${errors}\nCall ${tool.name} exactly once with the corrected input.`;
  if (trace && first.outcome === "incomplete") {
    return runSiteTool(call, tool, schema, [{
      role: "user", content: `${prompt}\nThe previous response was incomplete. Keep copy and layout as concise as the contract allows and return one complete ${tool.name} call.`,
    }], true, trace);
  }
  // The provider requires the entire assistant turn (including signed thinking
  // blocks) and a result for every tool-use ID. No ID is invented for text-only replies.
  const repair: Anthropic.MessageParam = { role: "user", content: first.blocks.length
    ? first.blocks.map(({ id }) => ({ type: "tool_result", tool_use_id: id, is_error: true, content: instructions }))
    : instructions };
  const history: Anthropic.MessageParam[] = first.response.content.length
    ? [...messages, { role: "assistant", content: first.response.content }] : messages;
  return runSiteTool(call, tool, schema, [...history, repair], true, trace);
}

export async function fillPage<T>(call: SiteToolCall, tool: SiteTool, schema: z.ZodType<T>, prompt: string) {
  return (await fillSiteTool(call, tool, schema, prompt)).result;
}
