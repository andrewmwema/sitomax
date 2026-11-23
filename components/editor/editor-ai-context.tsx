"use client";

import { createContext, useContext } from "react";
import type { Editor } from "@tiptap/react";

export type AiUi = {
  openText: (editor: Editor) => void;
};
export const AiContext = createContext<AiUi | null>(null);

export function useEditorAi() {
  const context = useContext(AiContext);
  if (!context) throw new Error("Editor AI context missing");
  return context;
}

export function useOptionalEditorAi() {
  return useContext(AiContext);
}
