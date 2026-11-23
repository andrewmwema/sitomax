"use client";

import { createContext, useContext } from "react";
import type { AgentEditorState } from "@/lib/ai/agent-apply-types";
import type { AgentReviewState } from "./agent-review-card";

/**
 * Entry point to the AI agent for the rest of the editor. Kept free of the
 * panel's own imports so block and field modules can use it.
 */
export type ReviewSession = { threadId: string; review: AgentReviewState };
/** How the agent reaches the open editor: saving, and showing drafts written on the server. */
export type AgentEditorBridge = {
  /** Saves unsaved edits so server-side changes are based on them. */
  saveDraft: () => Promise<boolean>;
  /** Shows the stored draft in the editor as one undoable step; null means nothing changed here. */
  adopt: (state: AgentEditorState | null) => Promise<boolean>;
  previewMetadata: Record<string, unknown>;
};
/** A request routed to the agent from elsewhere in the editor. */
export type AgentRequest = { prompt?: string; sectionId?: string; header?: boolean; insertAt?: number };
export type PanelContextValue = {
  open: boolean; toggle: () => void; openWith: (request: AgentRequest) => void;
  reviewSession: ReviewSession | null;
  setReviewSession: (value: ReviewSession | null) => void;
  editor: AgentEditorBridge;
};
export const PanelContext = createContext<PanelContextValue | null>(null);

export function useAiAgentPanel() {
  const context = useContext(PanelContext);
  if (!context) throw new Error("AI agent panel context missing");
  return context;
}
/** For editor parts that also render outside the full editor, such as previews. */
export function useOptionalAiAgentPanel() {
  return useContext(PanelContext);
}
