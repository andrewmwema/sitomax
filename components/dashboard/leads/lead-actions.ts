import { applyLeadInboxAction, updateLeads } from "@/app/(dashboard)/dashboard/forms/actions";
import type { Lead } from "@/lib/forms/submissions";

export type LeadInboxActionName = "star" | "unstar" | "read" | "unread" | "archive" | "unarchive"
  | "snooze" | "unsnooze" | "remind" | "clear_reminder" | "trash" | "restore" | "delete_forever";

// The server accepts at most 25 leads per call.
const BATCH = 25;
const batches = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / BATCH) }, (_, index) => ids.slice(index * BATCH, (index + 1) * BATCH));

/** Runs an inbox action for any number of leads. Resolves to an error message, or null on success. */
export async function runLeadAction(action: LeadInboxActionName, ids: string[], at?: string): Promise<string | null> {
  try {
    for (const batch of batches(ids)) {
      const form = new FormData();
      form.set("action", action);
      batch.forEach((id) => form.append("leadIds", id));
      if (at && action === "snooze") form.set("snoozeUntil", at);
      if (at && action === "remind") form.set("remindAt", at);
      const result = await applyLeadInboxAction({ error: "" }, form);
      if (result.error) return result.error;
    }
    return null;
  } catch {
    return "The request could not be completed. Check your connection and try again.";
  }
}

export async function setLeadStatus(ids: string[], status: Lead["status"]): Promise<string | null> {
  try {
    for (const batch of batches(ids)) {
      const form = new FormData();
      form.set("intent", "status");
      form.set("status", status);
      batch.forEach((id) => form.append("id", id));
      const result = await updateLeads({ error: "" }, form);
      if (result.error) return result.error;
    }
    return null;
  } catch {
    return "The request could not be completed. Check your connection and try again.";
  }
}

/** What an action changes on a lead, applied locally before the server confirms it. */
export function leadActionPatch(action: LeadInboxActionName, at?: string): Partial<Lead> {
  switch (action) {
    case "star": return { starred: true };
    case "unstar": return { starred: false };
    case "read": return { unread: false, is_read: true, has_unread_reply: false };
    case "unread": return { unread: true, is_read: false };
    case "archive": return { archived: true };
    case "unarchive": return { archived: false, archived_at: null };
    case "snooze": return { snoozed_until: at ?? null };
    case "unsnooze": return { snoozed_until: null };
    case "remind": return { remind_at: at ?? null };
    case "clear_reminder": return { remind_at: null };
    default: return {};
  }
}
