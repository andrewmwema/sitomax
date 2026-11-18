"use server";

import { runEditorAi } from "@/lib/ai/editor";
import { aiErrorMessage } from "@/lib/ai/provider-error";
import { runEditAssistant } from "@/lib/ai/edit-assistant";
import { unstable_rethrow } from "next/navigation";

export async function suggestEditorEdits(raw: unknown) {
  try {
    return { status: "success" as const, result: await runEditAssistant(raw) };
  } catch (cause) {
    unstable_rethrow(cause);
    console.error("AI edit assistant failed", { type: cause instanceof Error ? cause.name : "Unknown" });
    const fallback = cause instanceof Error && cause.name === "Error" ? cause.message
      : "Some proposed changes did not match the available options. Try a more specific request.";
    return { status: "error" as const, message: await aiErrorMessage(cause, fallback) };
  }
}

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
