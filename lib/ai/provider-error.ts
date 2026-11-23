import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export function providerFailure(cause: unknown) {
  if (!(cause instanceof Anthropic.APIError)) return null;
  // Use only the provider's error fields, not Error.message (which can include
  // a raw response body). Withhold messages pointing to submitted prompt data.
  const message = cause.apiMessage;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  return {
    status: cause.status,
    type: cause.type ?? "unknown_api_error",
    message: message && !/\b(?:messages|prompt|system|content|x-api-key|authorization)\b/i.test(message)
      ? (apiKey ? message.replaceAll(apiKey, "[redacted]") : message)
        .replace(/\bsk-ant-[\w-]+/g, "[redacted]").replace(/[\r\n\t]+/g, " ").slice(0, 1000)
      : "Provider message unavailable or withheld because it may contain request data.",
    providerRequestId: cause.requestID,
  };
}

/** Statuses at which the provider refused the request before generating anything billable. */
export function isDefinitiveProviderFailure(status: number | undefined) {
  return status !== undefined && [400, 401, 403, 404, 412, 413, 422, 429, 431].includes(status);
}

export class AiProviderError extends Error {
  constructor(message: string, readonly details: NonNullable<ReturnType<typeof providerFailure>>) {
    super(message);
  }
}

/** Whether the signed-in user is agency staff, who may see technical detail that clients must not. */
export async function isAgencyViewer(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("is_super_admin");
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function aiErrorMessage(cause: unknown, fallback: string): Promise<string> {
  if (!(cause instanceof AiProviderError)) return fallback;
  try {
    const supabase = await createClient();
    const { data: isAdmin, error } = await supabase.rpc("is_super_admin");
    if (error) console.error("Could not verify access to AI diagnostics", { code: error.code });
    if (!error && isAdmin === true) {
      const { status, type, message, providerRequestId } = cause.details;
      return `${fallback} Anthropic${status ? ` HTTP ${status}` : ""} (${type}): ${message}${providerRequestId ? ` [${providerRequestId}]` : ""}`;
    }
  } catch {
    console.error("Could not load the session for AI diagnostics");
  }
  return fallback;
}
