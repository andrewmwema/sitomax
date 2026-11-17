import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AI_ACTIONS, modelForAction, SITE_GENERATION_MODEL } from "./models";
import { assertPricedModel, type TokenUsage } from "./pricing";
import { checkLimit, recordUsage, releaseFailedRequest } from "./usage";

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
  largeRewrite: z.boolean().default(false),
  system: z.string().min(1).optional(),
  cacheTtl: z.enum(["5m", "1h"]).optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]), content: z.string().min(1),
  })).min(1),
  maxTokens: z.number().int().min(1).max(64_000),
});
export type AiRequest = z.input<typeof requestSchema>;

/** The only SDK call entry point: authenticated reservation -> provider -> ledger. */
export async function requestAi(raw: AiRequest): Promise<Anthropic.Message> {
  const input = requestSchema.parse(raw);
  const model = modelForAction(input.action, input.largeRewrite);
  assertPricedModel(model);
  if (input.cacheTtl && (model !== SITE_GENERATION_MODEL || !input.system)) {
    throw new Error("Prompt caching requires a priced model and a system prompt.");
  }
  const sdk = getClient();
  const reservation = await checkLimit(input.accountId, input.action, {
    siteId: input.siteId, largeRewrite: input.largeRewrite,
  });
  let response: Anthropic.Message;
  try {
    response = await sdk.messages.create({
      model: reservation.model, max_tokens: input.maxTokens, messages: input.messages,
      system: input.cacheTtl
        ? [{ type: "text", text: input.system!, cache_control: { type: "ephemeral", ttl: input.cacheTtl } }]
        : input.system,
    });
  } catch (cause) {
    const status = cause instanceof Anthropic.APIError ? cause.status : undefined;
    if (status === undefined || ![400, 401, 403, 404, 412, 413, 422, 429, 431].includes(status)) {
      // A timeout or server error may have occurred after billable generation.
      console.error("AI request outcome needs reconciliation", { requestId: reservation.id, status });
      throw new Error(`The AI request outcome is uncertain. Contact your agency with request ${reservation.id} before retrying.`);
    }
    try { await releaseFailedRequest(reservation); }
    catch {
      console.error("Failed AI request needs reservation reconciliation", { requestId: reservation.id });
      throw new Error(`The AI request failed and its reservation could not be released. Contact your agency with request ${reservation.id}.`);
    }
    // Avoid exposing vendor names, API credentials or prompt-bearing SDK errors.
    console.error("AI provider request failed", { requestId: reservation.id, status });
    throw new Error("The AI request failed. Please retry.");
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
    await recordUsage(reservation, tokens);
  } catch {
    // Do not refund or return a billable response that failed accounting.
    console.error("Completed AI request needs usage reconciliation", {
      requestId: reservation.id, model: response.model,
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
