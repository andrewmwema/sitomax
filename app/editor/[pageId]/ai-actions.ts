"use server";

import { runEditorAi } from "@/lib/ai/editor";

export async function editorAi(raw: unknown) {
  try {
    return { status: "success" as const, result: await runEditorAi(raw) };
  } catch (cause) {
    console.error("Editor AI request failed", { type: cause instanceof Error ? cause.name : "Unknown" });
    return { status: "error" as const, message: cause instanceof Error && cause.name === "Error"
      ? cause.message : "The AI request was invalid. Please try again." };
  }
}
