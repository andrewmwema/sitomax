import { describe, expect, it } from "vitest";
import { leadMatchesInboxView, leadInboxActionSchema, type LeadInboxViewRow } from "./inbox";

const lead = (overrides: Partial<LeadInboxViewRow> = {}): LeadInboxViewRow => ({
  status: "new",
  starred: false,
  archived_at: null,
  deleted_at: null,
  snoozed_until: null,
  last_message_direction: null,
  ...overrides,
});

describe("lead inbox view rules", () => {
  it("requires a reply for needs-reply and hides snoozed leads", () => {
    expect(leadMatchesInboxView(lead({ last_message_direction: "in" }), "needs_reply")).toBe(true);
    expect(leadMatchesInboxView(lead({ snoozed_until: "2099-01-01T00:00:00Z" }), "needs_reply")).toBe(false);
  });

  it("shows snoozed leads in all open", () => {
    expect(leadMatchesInboxView(lead({ snoozed_until: "2099-01-01T00:00:00Z" }), "all_open")).toBe(true);
  });

  it("does not show trashed or archived leads in open views", () => {
    expect(leadMatchesInboxView(lead({ deleted_at: "2026-01-01T00:00:00Z" }), "all_open")).toBe(false);
    expect(leadMatchesInboxView(lead({ archived_at: "2026-01-01T00:00:00Z" }), "all_open")).toBe(false);
  });

  it("validates bulk and trash actions", () => {
    expect(leadInboxActionSchema.safeParse({
      action: "trash",
      leadIds: ["00000000-0000-4000-8000-000000000001"],
    }).success).toBe(true);
  });
});
