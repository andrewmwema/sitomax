import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AI_ACTIONS, AI_USAGE_TYPES, modelForAction, SITE_GENERATION_MODEL } from "./models";
import { assertPricedModel, type TokenUsage } from "./pricing";
import { checkLimit, recordUsage, releaseFailedRequest } from "./usage";
import { anthropicRequestParams } from "./request-params";
import { AiProviderError, isDefinitiveProviderFailure, providerFailure } from "./provider-error";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI is not configured. Ask your agency to enable it.");
  // Automatic retries could bill multiple attempts but return usage for only one.
  return client ??= new Anthropic({ apiKey, maxRetries: 0, timeout: 120_000 });
}

const requestSchema = z.object({
  accountId: z.uuid(),
  siteId: z.uuid().optional(),
  action: z.enum(AI_ACTIONS),
  usageType: z.enum(AI_USAGE_TYPES).optional(),
  largeRewrite: z.boolean().default(false),
  generationId: z.uuid().optional(),
  correlationId: z.uuid().optional(),
  customGeneration: z.literal(true).optional(),
  tools: z.array(z.strictObject({
    name: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    description: z.string().optional(),
    strict: z.boolean(),
    input_schema: z.looseObject({ type: z.literal("object") }),
  })).optional(),
  toolName: z.string().optional(),
  system: z.string().min(1).optional(),
  cacheTtl: z.enum(["5m", "1h"]).optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.union([z.string().min(1), z.array(z.discriminatedUnion("type", [
      z.looseObject({ type: z.literal("text"), text: z.string() }),
      z.looseObject({ type: z.literal("thinking"), thinking: z.string(), signature: z.string() }),
      z.looseObject({ type: z.literal("redacted_thinking"), data: z.string() }),
      z.looseObject({ type: z.literal("tool_use"), id: z.string().min(1), name: z.string().min(1), input: z.unknown() }),
      z.looseObject({ type: z.literal("tool_result"), tool_use_id: z.string().min(1), is_error: z.boolean(), content: z.string().min(1) }),
    ])).min(1)]),
  })).min(1),
  maxTokens: z.number().int().min(1).max(64_000),
});
export type AiRequest = Omit<z.input<typeof requestSchema>, "messages"> & { messages: Anthropic.MessageParam[] };

/** The only SDK call entry point: authenticated reservation -> provider -> ledger. */
export async function requestAi(raw: AiRequest): Promise<Anthropic.Message & { _request_id?: string | null }> {
  const input = requestSchema.parse(raw);
  const model = modelForAction(input.action, input.largeRewrite);
  assertPricedModel(model);
  if (input.cacheTtl && (!input.system || (model !== SITE_GENERATION_MODEL && !(input.action === "edit_section" && input.cacheTtl === "5m" && !input.toolName)))) {
    throw new Error("Prompt caching requires a priced model and a system prompt.");
  }
  const sdk = getClient();
  if (input.toolName && !input.tools?.some((tool) => tool.name === input.toolName)) throw new Error("Choose a supplied AI tool.");
  const reservation = await checkLimit(input.accountId, input.action, {
    siteId: input.siteId, largeRewrite: input.largeRewrite,
    ...(input.generationId ? { generationId: input.generationId } : {}),
    ...(input.customGeneration ? { customGeneration: true } : {}),
  });
  let response: Anthropic.Message & { _request_id?: string | null };
  try {
    response = await sdk.messages.create(anthropicRequestParams(reservation.model, input));
  } catch (cause) {
    const details = providerFailure(cause);
    const status = details?.status;
    const requestError = (message: string) => details ? new AiProviderError(message, details) : new Error(message);
    if (details) console.error("Anthropic request failed", {
      ...details, requestId: reservation.id, correlationId: input.correlationId, generationId: input.generationId, model: reservation.model, action: input.action,
    });
    if (!isDefinitiveProviderFailure(status)) {
      // A timeout or server error may have occurred after billable generation.
      console.error("AI request outcome needs reconciliation", { requestId: reservation.id, status });
      throw requestError(`The AI request outcome is uncertain. Contact your agency with request ${reservation.id} before retrying.`);
    }
    try { await releaseFailedRequest(reservation); }
    catch {
      console.error("Failed AI request needs reservation reconciliation", { requestId: reservation.id });
      throw requestError(`The AI request failed and its reservation could not be released. Contact your agency with request ${reservation.id}.`);
    }
    throw requestError("The AI request failed. Please retry.");
  }

  try {
    assertPricedModel(response.model);
    if (response.model !== reservation.model) throw new Error("The response model differs from its pricing reservation.");
    const usage = response.usage;
    const write5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
    const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    if ((usage.cache_creation_input_tokens ?? 0) !== write5m + write1h) {
      throw new Error("The provider did not return a priced cache-write breakdown.");
    }
    const tokens: TokenUsage = {
      inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWrite5mTokens: write5m, cacheWrite1hTokens: write1h,
    };
    await recordUsage(reservation, tokens, undefined, input.usageType ?? (input.action === "generate_site" ? "site_generation" : "edit"));
  } catch {
    // Do not refund or return a billable response that failed accounting.
    console.error("Completed AI request needs usage reconciliation", {
      requestId: reservation.id, correlationId: input.correlationId, model: response.model,
      inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens,
      cacheReadTokens: response.usage?.cache_read_input_tokens,
      cacheWriteTokens: response.usage?.cache_creation_input_tokens,
      cacheWrite5mTokens: response.usage?.cache_creation?.ephemeral_5m_input_tokens,
      cacheWrite1hTokens: response.usage?.cache_creation?.ephemeral_1h_input_tokens,
    });
    throw new Error(`AI usage could not be recorded. Contact your agency with request ${reservation.id} before retrying.`);
  }
  return response;
}
