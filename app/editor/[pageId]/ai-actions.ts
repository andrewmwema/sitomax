"use server";

import { runEditorAi } from "@/lib/ai/editor";
import { aiErrorMessage } from "@/lib/ai/provider-error";

export async function editorAi(raw: unknown) {
  try {
    return { status: "success" as const, result: await runEditorAi(raw) };
  } catch (cause) {
    console.error("Editor AI request failed", { type: cause instanceof Error ? cause.name : "Unknown" });
    const fallback = cause instanceof Error && cause.name === "Error"
      ? cause.message : "The AI request was invalid. Please try again.";
    return { status: "error" as const, message: await aiErrorMessage(cause, fallback) };
  }
}
