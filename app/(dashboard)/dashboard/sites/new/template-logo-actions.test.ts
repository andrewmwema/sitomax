import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultHeader } from "@/lib/header";

const mocks = vi.hoisted(() => ({ access: vi.fn(), checkpoint: vi.fn() }));
vi.mock("@/lib/media-server", () => ({ mediaAccess: mocks.access }));
vi.mock("@/lib/ai/usage", () => ({ checkpointTemplateLogo: mocks.checkpoint }));
import { applyTemplateLogo } from "./template-logo-actions";
import { AiUserError } from "@/lib/ai/errors";

const siteId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const generationId = "00000000-0000-4000-8000-000000000003";
const path = `${siteId}/TEST-logo-123.png`;
const url = `https://example.test/storage/v1/object/public/site-assets/${path}`;
const header = defaultHeader("Example");

beforeEach(() => {
  vi.resetAllMocks();
  const site = { account_id: accountId, name: "Example", business: { businessName: "Example" },
    theme: { style: "modern", colors: { primary: "#123456" } }, draft_theme: null, draft_header: header };
  mocks.access.mockResolvedValue({ supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: site, error: null }) }) }) }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: url } }) }) },
  } });
  mocks.checkpoint.mockResolvedValue(undefined);
});

describe("template logo action", () => {
  it("uses the site asset URL and passes the current theme and header for conflict checks", async () => {
    await expect(applyTemplateLogo({ siteId, generationId, path, alt: "Example logo" })).resolves.toEqual({ status: "success" });
    expect(mocks.checkpoint).toHaveBeenCalledWith(accountId, siteId, generationId, expect.objectContaining({
      path, url, expectedHeader: header, expectedTheme: { style: "modern", colors: { primary: "#123456" } },
      header: expect.objectContaining({ logo: expect.objectContaining({ mode: "image", image: url }) }),
    }));
  });

  it("rejects assets outside the destination site before accessing storage", async () => {
    const result = await applyTemplateLogo({ siteId, generationId, path: "other/TEST-logo.png", alt: "" });
    expect(result.status).toBe("error");
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.checkpoint).not.toHaveBeenCalled();
  });

  it("reports a concurrent-edit conflict without claiming the logo was applied", async () => {
    mocks.checkpoint.mockRejectedValue(new AiUserError("The site theme or header changed. Choose your uploaded logo in the editor."));
    await expect(applyTemplateLogo({ siteId, generationId, path, alt: "" })).resolves.toEqual({
      status: "error", message: "The site theme or header changed. Choose your uploaded logo in the editor.",
    });
  });
});
