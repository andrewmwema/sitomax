export const SITE_GENERATION_MODEL = "claude-sonnet-5-5";
export const SMALL_EDIT_MODEL = "claude-haiku-5-5";

export const AI_ACTIONS = ["generate_site", "edit_section", "rewrite_text"] as const;
export type AiAction = (typeof AI_ACTIONS)[number];
export type AiModel = typeof SITE_GENERATION_MODEL | typeof SMALL_EDIT_MODEL;

export function modelForAction(action: AiAction, largeRewrite = false): AiModel {
  return action === "generate_site" || largeRewrite ? SITE_GENERATION_MODEL : SMALL_EDIT_MODEL;
}
