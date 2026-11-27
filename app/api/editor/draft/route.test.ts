import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), save: vi.fn(), ai: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }));
vi.mock("@/app/editor/[pageId]/actions", () => ({ savePageDraft: mocks.save, saveAiEdit: mocks.ai }));
import { POST } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const body = { pageId: id, expectedVersion: id, data: { content: [], root: {} } };
function request(value: unknown = body, origin = "https://app.sitomax.com") {
  return new Request("https://app.sitomax.com/api/editor/draft", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(value),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id } }, error: null });
  mocks.save.mockResolvedValue({ status: "success", message: "Saved.", version: id });
});
describe("editor keepalive draft save", () => {
  it("requires same-origin authentication and valid input before writing", async () => {
    expect((await POST(request(body, "https://other.example"))).status).toBe(403);
    mocks.user.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request({ ...body, expectedVersion: "bad" }))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses the same guarded save and returns its actual version", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ version: id });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(id, body.data, id);
  });
  it("preserves transient failure and conflict signals", async () => {
    mocks.save.mockResolvedValueOnce({ status: "error", message: "Busy.", retryable: true });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ retryable: true });
    mocks.save.mockResolvedValueOnce({ status: "error", message: "Reload.", conflict: true });
    expect((await POST(request())).status).toBe(409);
  });
});
