import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), lookup: vi.fn(), invite: vi.fn(), upsert: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: mocks.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }), upsert: mocks.upsert }),
  auth: { admin: { generateLink: mocks.invite } },
}) }));
vi.mock("@/lib/email", async (original) => ({ ...await original<typeof import("@/lib/email")>(), sendEmail: mocks.send }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { EmailDeliveryError } from "@/lib/email";
import { inviteOwner } from "./actions";

const accountId = "00000000-0000-4000-8000-000000000001";
const email = "client@example.test";
function invitation() {
  const form = new FormData();
  form.set("accountId", accountId);
  form.set("email", email);
  return inviteOwner({ status: "idle" }, form);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({});
  mocks.lookup.mockResolvedValue({ data: { id: accountId, is_internal: false }, error: null });
  mocks.invite.mockResolvedValue({ error: null, data: { user: { id: "owner" }, properties: { hashed_token: "sample_hash" } } });
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("client invitations", () => {
  it.each([null, { id: "agency", is_internal: true }])("rejects missing and internal accounts before sending invitations: %j", async (account) => {
    mocks.lookup.mockResolvedValue({ data: account, error: null });
    expect(await invitation()).toMatchObject({
      status: "error", message: expect.stringContaining("only available for client accounts"),
    });
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("saves owner access before sending a tagged invitation with a password setup link", async () => {
    expect(await invitation()).toMatchObject({ status: "success" });
    expect(mocks.invite).toHaveBeenCalledWith({ type: "invite", email });
    expect(mocks.upsert).toHaveBeenCalledBefore(mocks.send);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: email, tag: "invite",
      text: expect.stringContaining("/auth/callback?next=%2Fset-password&type=invite&token_hash=sample_hash"),
      html: expect.stringContaining("Accept invitation"),
    }));
  });

  it("reports delivery failure without claiming the invitation was sent", async () => {
    mocks.send.mockRejectedValueOnce(new EmailDeliveryError("The sender is not verified."));
    expect(await invitation()).toEqual({
      status: "error", message: "Owner access was saved, but the invitation was not sent. The sender is not verified.",
    });
  });

  it("adds a registered user without attempting to send an invite", async () => {
    mocks.invite.mockResolvedValue({ error: { code: "email_exists" } });
    mocks.lookup.mockResolvedValueOnce({ data: { id: accountId, is_internal: false } })
      .mockResolvedValueOnce({ data: { id: "existing-owner" } });
    expect(await invitation()).toMatchObject({ status: "success" });
    expect(mocks.upsert).toHaveBeenCalledWith({ account_id: accountId, user_id: "existing-owner", role: "owner" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
