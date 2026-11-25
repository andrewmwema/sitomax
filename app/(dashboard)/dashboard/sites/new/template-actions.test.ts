import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBusiness } from "@/lib/business";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { createSiteFromMasterTemplate } from "./template-actions";

const accountId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const pageId = "00000000-0000-4000-8000-000000000003";
const generationId = "00000000-0000-4000-8000-000000000004";
const input = { accountId, templateId: "showcase", siteName: "Example", subdomain: "example", timezone: "UTC" };
const ai = { generationId, business: { ...emptyBusiness, businessName: "Example" } };

beforeEach(() => {
  vi.resetAllMocks();
  const rows: Record<string, object> = {
    profiles: { is_super_admin: false }, accounts: { id: accountId, is_internal: false },
    account_members: { account_id: accountId }, pages: { id: pageId },
  };
  mocks.requireUser.mockResolvedValue({
    user: { id: "owner" },
    supabase: {
      from: (table: string) => {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: rows[table], error: null }) };
        return query;
      },
      rpc: mocks.rpc,
    },
  });
});

describe("template copy action", () => {
  it("preserves the regular template copy path", async () => {
    mocks.rpc.mockResolvedValue({ data: siteId, error: null });
    await expect(createSiteFromMasterTemplate(input)).resolves.toEqual({ status: "success", siteId, editorPageId: pageId });
    expect(mocks.rpc).toHaveBeenCalledWith("create_site_from_template", expect.objectContaining({ p_account_id: accountId }));
  });

  it("uses the atomic copy for AI and returns its checkpoints", async () => {
    const checkpoints = [{ pageId }];
    mocks.rpc.mockResolvedValue({ data: { siteId, editorPageId: pageId, pages: checkpoints }, error: null });
    await expect(createSiteFromMasterTemplate(input, ai)).resolves.toEqual({
      status: "success", siteId, editorPageId: pageId, checkpoints,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("create_ai_template_site", expect.objectContaining({
      p_generation_id: generationId, p_business: ai.business,
    }));
  });

  it("rejects invalid AI options before calling the database", async () => {
    await expect(createSiteFromMasterTemplate(input, { ...ai, generationId: "invalid" })).resolves.toMatchObject({ status: "error" });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
