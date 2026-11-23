"use server";

import { generateEmptyPage, saveEmptyPage } from "@/lib/ai/empty-page";
import { aiErrorMessage } from "@/lib/ai/provider-error";
import { unstable_rethrow } from "next/navigation";

export async function buildEmptyPageWithAi(pageId: string) {
  try {
    return { status: "success" as const, ...await generateEmptyPage(pageId) };
  } catch (cause) {
    unstable_rethrow(cause);
    const fallback = cause instanceof Error && cause.name === "Error"
      ? cause.message : "Could not build this empty page. No drafts were changed.";
    return { status: "error" as const, message: await aiErrorMessage(cause, fallback) };
  }
}

export async function saveEmptyPageWithAi(pageId: string, data: unknown, expectedDraft: unknown, expectedVersion: string) {
  try {
    return await saveEmptyPage(pageId, data, expectedDraft, expectedVersion);
  } catch (cause) {
    unstable_rethrow(cause);
    return { status: "error" as const, message: cause instanceof Error && cause.name === "Error"
      ? cause.message : "Could not save this AI page. No drafts were changed." };
  }
}
