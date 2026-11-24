const SITE_MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"] as const;
const configuredSiteModel = process.env.ANTHROPIC_MODEL?.trim();

function isSiteModel(value: string): value is (typeof SITE_MODELS)[number] {
  return SITE_MODELS.some((model) => model === value);
}

if (configuredSiteModel && !isSiteModel(configuredSiteModel)) {
  throw new Error("ANTHROPIC_MODEL must be a model with configured AI pricing.");
}

export const SITE_GENERATION_MODEL =
  configuredSiteModel && isSiteModel(configuredSiteModel) ? configuredSiteModel : SITE_MODELS[0];
export const SMALL_EDIT_MODEL = "claude-haiku-5-5";

export const AI_ACTIONS = ["generate_site", "edit_section", "rewrite_text"] as const;
export type AiAction = (typeof AI_ACTIONS)[number];
export type AiModel = typeof SITE_GENERATION_MODEL | typeof SMALL_EDIT_MODEL;
export const AI_USAGE_TYPES = ["site_generation", "agent_run", "edit", "lead_draft", "blog_ai"] as const;
export type AiUsageType = (typeof AI_USAGE_TYPES)[number];

export function modelForAction(action: AiAction, largeRewrite = false): AiModel {
  return action === "generate_site" || largeRewrite ? SITE_GENERATION_MODEL : SMALL_EDIT_MODEL;
}
