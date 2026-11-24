import { createClient } from "@supabase/supabase-js";

export async function createEvalRecorder({ calculateCostUsd, messageUsage }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key, AGENCY_AI_ACCESS_TOKEN: token } = process.env;
  if (!url || !key || !token) throw new Error("Live scripts require Supabase configuration and an agency session. Run via npm run agency-token.");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error || data !== true) throw new Error("Agency session is invalid, expired or not a super admin. No provider request was sent.");
  return async (response) => {
    const id = crypto.randomUUID();
    let usage;
    let cost;
    try {
      usage = messageUsage(response);
      if ((response.usage.cache_creation_input_tokens ?? 0) !== usage.cacheWrite5mTokens + usage.cacheWrite1hTokens) {
        throw new Error("Missing cache-write breakdown.");
      }
      cost = calculateCostUsd(response.model, usage);
    } catch (error) {
      console.error("Eval usage needs reconciliation", { id, model: response.model, usage: response.usage });
      throw new Error("Could not price eval usage. Stopping; reconcile the logged usage before retrying.", { cause: error });
    }
    const entry = {
      p_id: id, p_model: response.model, p_input_tokens: usage.inputTokens, p_output_tokens: usage.outputTokens,
      p_cache_read_tokens: usage.cacheReadTokens, p_cache_write_5m_tokens: usage.cacheWrite5mTokens,
      p_cache_write_1h_tokens: usage.cacheWrite1hTokens, p_cost_usd: cost,
    };
    try {
      const saved = await supabase.rpc("record_ai_eval_usage", entry);
      if (saved.error) throw saved.error;
    } catch (error) {
      console.error("Eval usage needs reconciliation", entry);
      throw new Error("Could not record eval usage. Stopping; reconcile the logged usage before retrying.", { cause: error });
    }
  };
}
