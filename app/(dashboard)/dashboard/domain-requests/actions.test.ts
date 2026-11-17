import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), saved: vi.fn(), notify: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: mocks.auth }));
vi.mock("@/lib/domains/request-email", () => ({ notifyDomainRequestDone: mocks.notify }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { DomainEmailError } from "@/lib/domains/email";
import { updateDomainRequest } from "./actions";
const id = "00000000-0000-4000-8000-000000000001";
const initial = { error: "", success: "" };
const form = (status: string) => { const data = new FormData(); data.set("status", status); data.set("notes", "DNS setup complete."); return data; };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ supabase: { from: () => ({ update: mocks.update }) } });
  mocks.update.mockReturnValue({ eq: () => ({ select: () => ({ maybeSingle: mocks.saved }) }) });
  mocks.saved.mockResolvedValue({ data: { site_id: id }, error: null });
  mocks.notify.mockResolvedValue(undefined);
});
describe("agency request status updates", () => {
  it("requires super-admin authorization before any update", async () => {
    mocks.auth.mockRejectedValue(new Error("Forbidden"));
    await expect(updateDomainRequest(id, initial, form("done"))).rejects.toThrow("Forbidden");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("updates only status/notes via the user-scoped client and notifies on completion", async () => {
    expect((await updateDomainRequest(id, initial, form("in_progress"))).error).toBe("");
    expect(mocks.notify).not.toHaveBeenCalled();
    expect((await updateDomainRequest(id, initial, form("done"))).error).toBe("");
    expect(mocks.update).toHaveBeenLastCalledWith({ status: "done", notes: "DNS setup complete." });
    expect(mocks.notify).toHaveBeenCalledWith(id);
    expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/sites/${id}/domains`);
  });
  it("rejects invalid updates and reports mail failures without losing the saved status", async () => {
    expect((await updateDomainRequest(id, initial, form("invalid"))).error).toBeTruthy();
    const data = form("done"); data.set("notes", "x".repeat(1001));
    expect((await updateDomainRequest(id, initial, data)).error).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.notify.mockRejectedValue(new DomainEmailError("Email is not configured."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await updateDomainRequest(id, initial, form("done"))).error).toContain("Status saved.");
    expect(mocks.update).toHaveBeenCalledWith({ status: "done", notes: "DNS setup complete." });
    vi.restoreAllMocks();
  });
});
