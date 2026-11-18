import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), lookup: vi.fn(), invite: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: mocks.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }), upsert: mocks.upsert }),
  auth: { admin: { inviteUserByEmail: mocks.invite } },
}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { inviteOwner } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({});
});

describe("client invitations", () => {
  it.each([null, { id: "agency", is_internal: true }])("rejects missing and internal accounts before sending invitations: %j", async (account) => {
    mocks.lookup.mockResolvedValue({ data: account, error: null });
    const form = new FormData();
    form.set("accountId", "00000000-0000-4000-8000-000000000001");
    form.set("email", "client@example.test");
    expect(await inviteOwner({ status: "idle" }, form)).toMatchObject({
      status: "error", message: expect.stringContaining("only available for client accounts"),
    });
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
