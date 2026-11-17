import "server-only";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_ACTIONS, modelForAction, type AiAction, type AiModel } from "./models";
import { assertPricedModel, calculateCostUsd, tokenUsageSchema, type TokenUsage } from "./pricing";

export type AiReservation = { id: string; model: AiModel };

async function authorizeAccount(accountId: string) {
  const { supabase, user } = await requireUser();
  const { data: account, error } = await supabase.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (error) throw new Error("Could not check AI account access.", { cause: error });
  if (!account) throw new Error("You do not have access to this AI account.");
  return user;
}

export async function checkLimit(
  accountId: string,
  action: AiAction,
  options: { siteId?: string; largeRewrite?: boolean; generationId?: string } = {},
): Promise<AiReservation> {
  const parsed = z.object({
    accountId: z.uuid(), action: z.enum(AI_ACTIONS), siteId: z.uuid().optional(),
    largeRewrite: z.boolean().optional(),
    generationId: z.uuid().optional(),
  }).parse({ accountId, action, ...options });
  const user = await authorizeAccount(parsed.accountId);

  const model = modelForAction(parsed.action, parsed.largeRewrite);
  assertPricedModel(model);
  // The DB rechecks membership/site ownership and atomically reserves the quota.
  if (parsed.generationId && parsed.action !== "generate_site") throw new Error("A generation can only contain site-generation calls.");
  const { data: id, error: reserveError } = await createAdminClient().rpc(parsed.generationId ? "reserve_ai_generation_call" : "reserve_ai_request", {
    p_user_id: user.id, p_account_id: parsed.accountId, p_action: parsed.action,
    p_model: model, p_site_id: parsed.siteId ?? null,
    ...(parsed.generationId ? { p_generation_id: parsed.generationId } : {}),
  });
  if (reserveError) {
    if (reserveError.code === "P0001" || reserveError.code === "42501") throw new Error(reserveError.message);
    throw new Error("Could not reserve AI usage. Please retry.", { cause: reserveError });
  }
  return { id: z.uuid().parse(id), model };
}

export async function beginSiteGeneration(accountId: string, siteId?: string): Promise<string> {
  const parsed = z.object({ accountId: z.uuid(), siteId: z.uuid().optional() }).parse({ accountId, siteId });
  const user = await authorizeAccount(parsed.accountId);
  const { data, error } = await createAdminClient().rpc("begin_ai_site_generation", {
    p_user_id: user.id, p_account_id: parsed.accountId, p_site_id: parsed.siteId ?? null,
    p_model: modelForAction("generate_site"),
  });
  if (error) {
    if (error.code === "P0001" || error.code === "42501") throw new Error(error.message);
    throw new Error("Could not reserve a site generation.", { cause: error });
  }
  return z.uuid().parse(data);
}

export async function finishSiteGeneration(id: string, success: boolean, siteId?: string): Promise<void> {
  const { error } = await createAdminClient().rpc("finish_ai_site_generation", {
    p_generation_id: z.uuid().parse(id), p_success: success,
    ...(siteId ? { p_site_id: z.uuid().parse(siteId) } : {}),
  });
  if (error) throw new Error(`Generation ${id} needs usage reconciliation. Contact your agency before retrying.`, { cause: error });
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
