"use server";

import { aiErrorMessage } from "@/lib/ai/provider-error";
import { runBlogWriterAi } from "@/lib/ai/blog-writer";

export async function blogWriterAi(raw: unknown) {
  try {
    return { status: "success" as const, result: await runBlogWriterAi(raw) };
  } catch (cause) {
    console.error("Blog writing AI request failed", { type: cause instanceof Error ? cause.name : "Unknown" });
    const message = await aiErrorMessage(cause, "The AI request failed. Please try again.");
    return { status: "error" as const, message };
  }
}
