import "server-only";

import { z } from "zod";

export const leadInboxViews = [
  "needs_reply", "waiting", "all_open", "starred", "won", "lost", "archived", "trash",
] as const;
export type LeadInboxView = (typeof leadInboxViews)[number];

export const leadInboxActionSchema = z.object({
  action: z.enum([
    "star", "unstar", "read", "unread", "archive", "unarchive",
    "snooze", "unsnooze", "remind", "clear_reminder", "trash", "restore",
  ]),
  leadIds: z.array(z.uuid()).min(1).max(25),
  remindAt: z.string().datetime().nullable().optional(),
  snoozeUntil: z.string().datetime().nullable().optional(),
});

export type LeadInboxCounts = {
  needs_reply: number;
  waiting: number;
  all_open: number;
  starred: number;
  won: number;
  lost: number;
  archived: number;
  trash: number;
};

export type LeadInboxViewRow = {
  status: "new" | "contacted" | "won" | "lost";
  starred: boolean;
  archived_at: string | null;
  deleted_at: string | null;
  snoozed_until: string | null;
  last_message_direction: "in" | "out" | null;
};

export function leadMatchesInboxView(row: LeadInboxViewRow, view: LeadInboxView, now = new Date()) {
  if (view === "trash") return row.deleted_at !== null;
  if (row.deleted_at !== null) return false;
  if (view === "archived") return row.archived_at !== null;
  const snoozed = row.snoozed_until !== null && new Date(row.snoozed_until) > now;
  if (view === "needs_reply") return row.archived_at === null && !snoozed
    && (row.last_message_direction === "in" || (row.last_message_direction === null && row.status === "new"));
  if (view === "waiting") return row.archived_at === null && !snoozed && row.last_message_direction === "out";
  if (view === "all_open") return row.archived_at === null && row.status !== "won" && row.status !== "lost";
  if (view === "starred") return row.starred;
  if (view === "won") return row.archived_at === null && row.status === "won";
  if (view === "lost") return row.archived_at === null && row.status === "lost";
  return false;
}
