import "server-only";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_ACTIONS, modelForAction, type AiAction, type AiModel } from "./models";
import { assertPricedModel, calculateCostUsd, tokenUsageSchema, type TokenUsage } from "./pricing";
import { agentRunUsageSchema, type AgentRunUsage } from "./agent-usage";
import { AiUserError } from "./errors";

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
  options: { siteId?: string; largeRewrite?: boolean; generationId?: string; customGeneration?: true } = {},
): Promise<AiReservation> {
  const parsed = z.object({
    accountId: z.uuid(), action: z.enum(AI_ACTIONS), siteId: z.uuid().optional(),
    largeRewrite: z.boolean().optional(),
    generationId: z.uuid().optional(),
    customGeneration: z.literal(true).optional(),
  }).parse({ accountId, action, ...options });
  const user = await authorizeAccount(parsed.accountId);

  const model = modelForAction(parsed.action, parsed.largeRewrite);
  assertPricedModel(model);
  // The DB rechecks membership/site ownership and atomically reserves the quota.
  if (parsed.generationId && parsed.action !== "generate_site") throw new Error("A generation can only contain site-generation calls.");
  if (parsed.customGeneration && !parsed.generationId) throw new Error("Custom section calls require a site generation.");
  const { data: id, error: reserveError } = await createAdminClient().rpc(parsed.generationId ? "reserve_ai_generation_call" : "reserve_ai_request", {
    p_user_id: user.id, p_account_id: parsed.accountId, p_action: parsed.action,
    p_model: model, p_site_id: parsed.siteId ?? null,
    ...(parsed.generationId ? { p_generation_id: parsed.generationId } : {}),
    ...(parsed.customGeneration ? { p_custom: true } : {}),
  });
  if (reserveError) {
    if (reserveError.code === "P0001" || reserveError.code === "42501") throw new AiUserError(reserveError.message);
    throw new Error("Could not reserve AI usage. Please retry.", { cause: reserveError });
  }
  return { id: z.uuid().parse(id), model };
}

export async function beginSiteGeneration(accountId: string, siteId?: string, pageCount?: number): Promise<string> {
  const parsed = z.object({ accountId: z.uuid(), siteId: z.uuid().optional() }).parse({ accountId, siteId });
  const user = await authorizeAccount(parsed.accountId);
  const { data, error } = await createAdminClient().rpc(pageCount === undefined ? "begin_ai_site_generation" : "begin_selected_ai_generation", {
    p_user_id: user.id, p_account_id: parsed.accountId, p_site_id: parsed.siteId ?? null,
    p_model: modelForAction("generate_site"),
    ...(pageCount === undefined ? {} : { p_page_count: z.number().int().min(1).max(10).parse(pageCount) }),
  });
  if (error) {
    if (error.code === "P0001" || error.code === "42501") throw new Error(error.message);
    throw new Error("Could not reserve a site generation.", { cause: error });
  }

  return z.uuid().parse(data);
}

export async function stageSelectedGeneration(accountId: string, siteId: string, generationId: string, pages: unknown) {
  const user = await authorizeAccount(accountId);
  const { data, error } = await createAdminClient().from("ai_requests").update({ selected_page_result: pages })
    .eq("id", generationId).eq("user_id", user.id).eq("account_id", accountId).eq("site_id", siteId)
    .eq("status", "pending").eq("is_generation", true).is("generation_id", null).is("selected_page_result", null)
    .select("id").single();
  if (error || !data) throw new Error("Could not finalize the generation reservation.", { cause: error });
}

export async function startDraftCheckpoints(accountId: string, siteId: string, generationId: string, options: {
  name: string; subdomain?: string; theme: unknown; pages: unknown; business: unknown; expectedBusiness: unknown;
}) {
  const user = await authorizeAccount(accountId);
  const { data, error } = await createAdminClient().rpc("start_ai_draft_checkpoints", {
    p_user_id: user.id, p_generation_id: z.uuid().parse(generationId), p_site_id: z.uuid().parse(siteId),
    p_name: options.name, p_subdomain: options.subdomain ?? null, p_theme: options.theme, p_pages: options.pages,
    p_business: options.business, p_expected_business: options.expectedBusiness,
  });
  if (error) throw new Error(error.code === "P0001" ? error.message : "Could not prepare recoverable page drafts.", { cause: error });
  return data;
}

export async function checkpointDraft(accountId: string, generationId: string, retryId: string, draft: unknown) {
  const user = await authorizeAccount(accountId);
  const { data, error } = await createAdminClient().rpc("checkpoint_ai_draft", {
    p_user_id: user.id, p_generation_id: z.uuid().parse(generationId), p_retry_id: z.uuid().parse(retryId), p_data: draft,
  });
  if (error) throw new Error("Could not save this page checkpoint. Completed drafts remain available.", { cause: error });
  return z.boolean().parse(data);
}

export async function completeDraftCheckpoints(accountId: string, generationId: string) {
  const user = await authorizeAccount(accountId);
  const { error } = await createAdminClient().rpc("complete_ai_draft_checkpoints", {
    p_user_id: user.id, p_generation_id: z.uuid().parse(generationId),
  });
  if (error) throw new Error("Could not finalize this generation. Check saved drafts before retrying.", { cause: error });
}

export async function claimPageRetry(retryId: string) {
  const { supabase, user } = await requireUser();
  const { data: visible, error: accessError } = await supabase.rpc("can_retry_ai_page", { p_retry_id: retryId });
  if (accessError || visible !== true) throw new Error("This retry is not available.", { cause: accessError });
  const { data, error } = await createAdminClient().rpc("claim_ai_page_retry", { p_retry_id: retryId, p_user_id: user.id });
  if (error) throw new Error(error.code === "P0001" ? error.message : "This retry is not available.", { cause: error });
  return z.object({ leaseId: z.uuid(), pageId: z.uuid(), siteId: z.uuid(), accountId: z.uuid(), slug: z.string(), spec: z.unknown() }).parse(data);
}

export async function finishPageRetry(retryId: string, leaseId: string, data?: unknown) {
  const { supabase, user } = await requireUser();
  const { data: visible, error: accessError } = await supabase.rpc("can_retry_ai_page", { p_retry_id: retryId });
  if (accessError || visible !== true) throw new Error("This retry is no longer available.", { cause: accessError });
  if (data !== undefined) {
    const staged = await createAdminClient().from("ai_requests").update({ selected_page_result: data })
      .eq("id", leaseId).eq("user_id", user.id).eq("status", "pending").eq("is_generation", true)
      .not("generation_id", "is", null).select("id").single();
    if (staged.error) throw new Error("Could not finalize the retry reservation.", { cause: staged.error });
  }
  const { error, data: saved } = await supabase.rpc("finish_ai_page_retry", { p_retry_id: retryId, p_lease_id: leaseId });
  if (error) throw new Error("Could not complete the page retry.", { cause: error });
  return saved === true;
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

export async function upgradeAiAgentRequest(accountId: string, requestId: string) {
  await authorizeAccount(z.uuid().parse(accountId));
  const { error } = await createAdminClient().rpc("upgrade_ai_agent_request", {
    p_request_id: z.uuid().parse(requestId),
  });
  if (error?.code === "P0001") throw new AiUserError(error.message);
  if (error) throw new Error("Could not reserve credits for this large AI run.", { cause: error });
}

/**
 * Counts one agent request (a message, an answer, an approval or a Continue)
 * against the account's hourly and daily limits. Agency staff are exempt.
 */
export async function reserveAiAgentSlot(accountId: string) {
  const user = await authorizeAccount(z.uuid().parse(accountId));
  const { error } = await createAdminClient().rpc("reserve_ai_agent_slot", { p_user_id: user.id, p_account_id: accountId });
  if (!error) return;
  if (error.code === "P0001" || error.code === "42501") throw new AiUserError(error.message);
  // Until its migration is applied there is no account limit to enforce.
  if (error.code === "PGRST202" || error.code === "42883") {
    console.error("AI agent account limits are not installed", { code: error.code });
    return;
  }
  throw new Error("Could not check the AI agent limit. Please retry.", { cause: error });
}

type AgentSupabase = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

async function assertAgentThreadAccess(supabase: AgentSupabase, threadId: string) {
  const { data, error } = await supabase.from("ai_agent_threads").select("id").eq("id", threadId).maybeSingle();
  if (error || !data) throw new Error("This AI conversation is unavailable.");
}

async function assertAgentRunAccess(supabase: AgentSupabase, threadId: string, runId: string) {
  const { data, error } = await supabase.from("ai_agent_runs").select("id")
    .eq("id", runId).eq("thread_id", threadId).maybeSingle();
  if (error || !data) throw new Error("This AI run is unavailable.");
}

/** The saved model conversation of a run. Clients cannot read it: it holds token counts. */
export async function loadAiAgentRunState(supabase: AgentSupabase, threadId: string, runId: string): Promise<unknown> {
  await assertAgentRunAccess(supabase, threadId, runId);
  const { data, error } = await createAdminClient().from("ai_agent_runs").select("run_state")
    .eq("id", runId).eq("thread_id", threadId).maybeSingle();
  if (error || !data) throw new Error("This AI run is unavailable.", { cause: error });
  return data.run_state;
}

/** What a run cost: credits for everyone, token counts and provider cost for the agency only. */
export async function getAiAgentRunUsage(supabase: AgentSupabase, threadId: string, runId: string): Promise<AgentRunUsage | null> {
  await assertAgentRunAccess(supabase, threadId, runId);
  const [{ data, error }, agency] = await Promise.all([
    createAdminClient().from("ai_agent_runs")
      .select("usage, cost_usd, request:ai_requests(credits_used, is_unlimited, status)")
      .eq("id", runId).eq("thread_id", threadId).maybeSingle(),
    supabase.rpc("is_super_admin"),
  ]);
  const run = z.object({
    usage: tokenUsageSchema, cost_usd: z.coerce.number().nonnegative(),
    request: z.object({ credits_used: z.number().int(), is_unlimited: z.boolean(), status: z.string() }).nullable(),
  }).safeParse(data);
  if (error || !run.success) {
    console.error("Could not load AI run usage", { code: error?.code ?? "ValidationError" });
    return null;
  }
  const { request, usage, cost_usd } = run.data;
  const charge = !request || request.status === "failed" ? "none" : request.is_unlimited ? "unlimited"
    : request.credits_used > 0 ? "credits" : "included";
  return agentRunUsageSchema.parse({
    charge, credits: charge === "credits" ? request!.credits_used : 0,
    ...(!agency.error && agency.data === true ? { tokens: usage, costUsd: cost_usd } : {}),
  });
}

export async function createAiAgentThread(supabase: AgentSupabase, userId: string, siteId: string, title: string) {
  const { data: site, error: siteError } = await supabase.from("sites").select("id").eq("id", siteId).maybeSingle();
  if (siteError || !site) throw new Error("This site is unavailable to your account.");
  const { data, error } = await createAdminClient().from("ai_agent_threads")
    .insert({ site_id: siteId, user_id: userId, title }).select("id").single();
  if (error || !data) throw new Error("Could not start an AI conversation.");
  return data.id;
}

export async function renameAiAgentThread(supabase: AgentSupabase, threadId: string, title: string) {
  await assertAgentThreadAccess(supabase, threadId);
  const { data, error } = await createAdminClient().from("ai_agent_threads").update({ title })
    .eq("id", threadId).select("id, title, updated_at").single();
  if (error || !data) throw new Error("Could not rename this AI conversation.", { cause: error });
  return data;
}

export async function deleteAiAgentThread(supabase: AgentSupabase, threadId: string) {
  await assertAgentThreadAccess(supabase, threadId);
  const { error } = await createAdminClient().from("ai_agent_threads").delete().eq("id", threadId);
  if (error) throw new Error("Could not delete this AI conversation.", { cause: error });
}

export async function createAiAgentRun(supabase: AgentSupabase, threadId: string, values: {
  request_id: string; changeset: unknown; run_state: unknown;
}) {
  await assertAgentThreadAccess(supabase, threadId);
  const { data, error } = await createAdminClient().from("ai_agent_runs")
    .insert({ thread_id: threadId, status: "running", ...values }).select("id").single();
  if (error || !data) throw new Error("Could not start the AI run.");
  return data.id;
}

export async function saveAiAgentRun(supabase: AgentSupabase, threadId: string, runId: string, values: {
  status: string; changeset?: unknown; run_state?: unknown; usage?: TokenUsage; cost_usd?: number;
  finished_at?: string | null;
}) {
  await assertAgentRunAccess(supabase, threadId, runId);
  const { error } = await createAdminClient().from("ai_agent_runs").update(values)
    .eq("id", runId).eq("thread_id", threadId);
  if (error) throw new Error("Could not save the AI run state.", { cause: error });
}

export async function claimAiAgentRun(supabase: AgentSupabase, threadId: string, runId: string, expectedStatus: string) {
  await assertAgentRunAccess(supabase, threadId, runId);
  const { data, error } = await createAdminClient().from("ai_agent_runs")
    .update({ status: "running", finished_at: null }).eq("id", runId).eq("thread_id", threadId)
    .eq("status", expectedStatus).select("id").maybeSingle();
  if (error) throw new Error("Could not continue this AI run.", { cause: error });
  return Boolean(data);
}

export async function appendAiAgentMessage(supabase: AgentSupabase, threadId: string, runId: string, values: {
  role: "user" | "assistant" | "tool"; content: string; tool_calls: unknown[];
}) {
  await assertAgentRunAccess(supabase, threadId, runId);
  const { error } = await createAdminClient().from("ai_agent_messages")
    .insert({ thread_id: threadId, run_id: runId, ...values });
  if (error) throw new Error("Could not save the AI conversation.", { cause: error });
}
