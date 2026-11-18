import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PLAN_SITE_TOOL } from "./site-schemas";

export type SiteTool = Omit<typeof PLAN_SITE_TOOL, "strict"> & { strict: boolean };
export type SiteToolCall = (tool: SiteTool, messages: Anthropic.MessageParam[]) => Promise<Anthropic.Message>;

export function validationMessage(error: z.ZodError) {
  return error.issues.map(({ path, message }) => `${path.join(".") || "(root)"}: ${message}`).join("\n").slice(0, 8000);
}

export async function runSiteTool<T>(
  call: SiteToolCall, tool: SiteTool, schema: z.ZodType<T>, messages: Anthropic.MessageParam[], repairAttempt = false,
) {
  const metadata = { tool: tool.name, strict: tool.strict, schemaBytes: Buffer.byteLength(JSON.stringify(tool.input_schema)), repairAttempt };
  let response: Anthropic.Message;
  try {
    response = await call(tool, messages);
  } catch (error) {
    console.info("AI site tool call", { ...metadata, stop_reason: null, repairNeeded: null });
    throw error;
  }
  const blocks = response.content.filter((block) => block.type === "tool_use");
  const matchingCall = response.stop_reason === "tool_use" && blocks.length === 1 && blocks[0].name === tool.name;
  const result = schema.safeParse(matchingCall ? blocks[0].input : undefined);
  console.info("AI site tool call", { ...metadata, stop_reason: response.stop_reason, repairNeeded: !result.success && !repairAttempt });
  return { response, blocks, result, matchingCall };
}

export async function fillPage<T>(call: SiteToolCall, tool: SiteTool, schema: z.ZodType<T>, prompt: string) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const first = await runSiteTool(call, tool, schema, messages);
  if (first.result.success) return first.result;
  const errors = first.matchingCall ? `Validation errors:\n${validationMessage(first.result.error)}`
    : `Expected exactly one ${tool.name} call; the previous response did not provide a complete matching call.`;
  const instructions = `${errors}\nCall ${tool.name} exactly once with the corrected input.`;
  // The provider requires the entire assistant turn (including signed thinking
  // blocks) and a result for every tool-use ID. No ID is invented for text-only replies.
  const repair: Anthropic.MessageParam = { role: "user", content: first.blocks.length
    ? first.blocks.map(({ id }) => ({ type: "tool_result", tool_use_id: id, is_error: true, content: instructions }))
    : instructions };
  const history: Anthropic.MessageParam[] = first.response.content.length
    ? [...messages, { role: "assistant", content: first.response.content }] : messages;
  return (await runSiteTool(call, tool, schema, [...history, repair], true)).result;
}
