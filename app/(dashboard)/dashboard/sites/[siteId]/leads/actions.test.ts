import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), site: vi.fn(), upsert: vi.fn(), update: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { id: "owner" }, supabase: {
  rpc: mocks.rpc,
  from: (table: string) => {
    if (table === "sites") return { select: () => ({ eq: () => ({ maybeSingle: mocks.site }) }) };
    if (table === "lead_site_settings") return { upsert: mocks.upsert, update: (data: unknown) => ({ eq: () => mocks.update(data) }) };
    throw new Error(table);
  },
} }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", async (original) => ({ ...await original<typeof import("@/lib/email")>(), sendEmail: mocks.send }));
import { EmailDeliveryError } from "@/lib/email";
import { saveLeadSettings } from "./actions";

const site = "00000000-0000-4000-8000-000000000001";
function form(intent: string) {
  const data = new FormData();
  data.set("site", site); data.set("intent", intent);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation((name: string) => {
    if (name === "can_manage_site_leads") return { data: true };
    if (name === "lead_new_notification_recipients") return { data: ["owner@example.test"] };
    if (name === "reserve_lead_notification_test") return { data: true };
    throw new Error(name);
  });
  mocks.site.mockResolvedValue({ data: { name: "Site", subdomain: "site" } });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.send.mockResolvedValue({ messageId: "test" });
});

describe("lead notification settings", () => {
  it("checks permissions and saves the site-wide switches", async () => {
    const data = form("notifications"); data.set("new_lead_enabled", "on"); data.set("digest_enabled", "on");
    expect((await saveLeadSettings({ error: "" }, data)).success).toBe("Settings saved.");
    expect(mocks.update).toHaveBeenCalledWith({ new_lead_enabled: true, reply_notifications_enabled: false, digest_enabled: true });
    mocks.rpc.mockReturnValue({ data: false });
    expect((await saveLeadSettings({ error: "" }, data)).error).toContain("Only site owners");
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("sends a test to eligible recipients and reports safe delivery errors", async () => {
    const data = form("test_notification");
    expect((await saveLeadSettings({ error: "" }, data)).success).toContain("sent to 1 recipient");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.test", tag: "form-notification" }));
    mocks.send.mockRejectedValue(new EmailDeliveryError("The sender is not verified."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await saveLeadSettings({ error: "" }, data)).error).toContain("The sender is not verified.");
    vi.restoreAllMocks();
  });

  it("refuses a test without recipients or when rate limited", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockImplementation((name: string) => name === "can_manage_site_leads" ? { data: true } :
      name === "lead_new_notification_recipients" ? { data: [] } : { data: false });
    expect((await saveLeadSettings({ error: "" }, form("test_notification"))).error).toContain("No eligible recipients");
    mocks.rpc.mockImplementation((name: string) => name === "can_manage_site_leads" ? { data: true } :
      name === "lead_new_notification_recipients" ? { data: ["owner@example.test"] } : { data: false });
    expect((await saveLeadSettings({ error: "" }, form("test_notification"))).error).toContain("one minute");
    expect(mocks.send).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("reports partial test delivery failure instead of claiming success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockImplementation((name: string) => name === "can_manage_site_leads" ? { data: true } :
      name === "lead_new_notification_recipients" ? { data: ["one@example.test", "two@example.test"] } : { data: true });
    mocks.send.mockResolvedValueOnce({ messageId: "test" }).mockRejectedValueOnce(new Error("provider internals"));
    const result = await saveLeadSettings({ error: "" }, form("test_notification"));
    expect(result.error).toContain("1 of 2 test notifications failed");
    expect(result.error).not.toContain("provider internals");
    expect(result.success).toBeUndefined();
    vi.restoreAllMocks();
  });
});
