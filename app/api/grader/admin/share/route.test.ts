import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/grader/admin-auth", () => ({ graderAdmin: mocks.auth }));
import { POST } from "./route";

function request(body: unknown, origin = "https://app.sitomax.com") {
  return new Request("https://app.sitomax.com/api/grader/admin/share", {
    method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, supabase: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

it("disables a share link through the super-admin RPC", async () => {
  expect((await POST(request({ slug: "joes-1234", disabled: true }))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("grader_set_share_disabled", { p_slug: "joes-1234", p_disabled: true });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  expect((await POST(request({ slug: "missing-1", disabled: true }))).status).toBe(404);
});

it("rejects non-admins, other origins and invalid bodies", async () => {
  expect((await POST(request({ slug: "joes-1234", disabled: true }, "https://evil.example"))).status).toBe(403);
  expect((await POST(request({ slug: "joes-1234" }))).status).toBe(400);
  mocks.auth.mockResolvedValue({ ok: false, status: 401 });
  expect((await POST(request({ slug: "joes-1234", disabled: true }))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
