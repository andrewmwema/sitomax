import "server-only";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_ACTIONS, modelForAction, type AiAction, type AiModel } from "./models";
import { assertPricedModel, calculateCostUsd, tokenUsageSchema, type TokenUsage } from "./pricing";

export type AiReservation = { id: string; model: AiModel };

export async function checkLimit(
  accountId: string,
  action: AiAction,
  options: { siteId?: string; largeRewrite?: boolean } = {},
): Promise<AiReservation> {
  const parsed = z.object({
    accountId: z.uuid(), action: z.enum(AI_ACTIONS), siteId: z.uuid().optional(),
    largeRewrite: z.boolean().optional(),
  }).parse({ accountId, action, ...options });
  const { supabase, user } = await requireUser();
  const { data: account, error } = await supabase.from("accounts").select("id").eq("id", parsed.accountId).maybeSingle();
  if (error) throw new Error("Could not check AI account access.", { cause: error });
  if (!account) throw new Error("You do not have access to this AI account.");

  const model = modelForAction(parsed.action, parsed.largeRewrite);
  assertPricedModel(model);
  // The DB rechecks membership/site ownership and atomically reserves the quota.
  const { data: id, error: reserveError } = await createAdminClient().rpc("reserve_ai_request", {
    p_user_id: user.id, p_account_id: parsed.accountId, p_action: parsed.action,
    p_model: model, p_site_id: parsed.siteId ?? null,
  });
  if (reserveError) {
    if (reserveError.code === "P0001" || reserveError.code === "42501") throw new Error(reserveError.message);
    throw new Error("Could not reserve AI usage. Please retry.", { cause: reserveError });
  }
  return { id: z.uuid().parse(id), model };
}

export async function recordUsage(reservation: AiReservation, rawUsage: TokenUsage): Promise<void> {
  const id = z.uuid().parse(reservation.id);
  const usage = tokenUsageSchema.parse(rawUsage);
  const cost = calculateCostUsd(reservation.model, usage);
  const { error } = await createAdminClient().rpc("finish_ai_request", {
    p_request_id: id, p_failed: false,
    p_input_tokens: usage.inputTokens, p_output_tokens: usage.outputTokens,
    p_cache_read_tokens: usage.cacheReadTokens, p_cache_write_5m_tokens: usage.cacheWrite5mTokens,
    p_cache_write_1h_tokens: usage.cacheWrite1hTokens, p_cost_usd: cost,
  });
  if (error) throw new Error("Could not record AI usage. The reservation remains held for reconciliation.", { cause: error });
}

export async function releaseFailedRequest(reservation: AiReservation): Promise<void> {
  const { error } = await createAdminClient().rpc("finish_ai_request", {
    p_request_id: z.uuid().parse(reservation.id), p_failed: true,
  });
  if (error) throw new Error("Could not release the failed AI request reservation.", { cause: error });
}
