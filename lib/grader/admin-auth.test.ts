import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.user },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}));
import { graderAdmin } from "./admin-auth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mocks.profile.mockResolvedValue({ data: { is_super_admin: true }, error: null });
});

it("requires a verified user and a super-admin profile", async () => {
  expect((await graderAdmin()).ok).toBe(true);
  mocks.profile.mockResolvedValue({ data: { is_super_admin: false }, error: null });
  expect(await graderAdmin()).toEqual({ ok: false, status: 403 });
  mocks.user.mockResolvedValue({ data: { user: null }, error: null });
  expect(await graderAdmin()).toEqual({ ok: false, status: 401 });
});

it("fails closed when the profile lookup fails", async () => {
  mocks.profile.mockResolvedValue({ data: null, error: { code: "db-error" } });
  expect(await graderAdmin()).toEqual({ ok: false, status: 503 });
});
