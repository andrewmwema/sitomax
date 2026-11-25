import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBusiness } from "@/lib/business";
import { premiumTemplates } from "@/templates/premium";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), copy: vi.fn(), request: vi.fn(), fill: vi.fn(), recommend: vi.fn(),
  begin: vi.fn(), cancel: vi.fn(), checkpoint: vi.fn(), complete: vi.fn(),
  claim: vi.fn(), finish: vi.fn(), moderate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/app/(dashboard)/dashboard/sites/new/template-actions", () => ({ createSiteFromMasterTemplate: mocks.copy }));
vi.mock("./client", () => ({ requestAi: mocks.request }));
vi.mock("./template-fill", () => ({ fillTemplatePage: mocks.fill }));
vi.mock("./template-recommendation", () => ({ recommendTemplate: mocks.recommend }));
vi.mock("./template-moderation", () => ({ moderateTemplateBusiness: mocks.moderate }));
vi.mock("./usage", () => ({
  beginTemplateBuild: mocks.begin, cancelTemplateBuild: mocks.cancel,
  checkpointDraft: mocks.checkpoint, completeTemplateCheckpoints: mocks.complete,
  claimTemplateRetry: mocks.claim, finishPageRetry: mocks.finish,
}));
import { buildTemplateSite, recommendTemplateBuild } from "./template-build";
import { AiUserError } from "./errors";

const accountId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const pageId = "00000000-0000-4000-8000-000000000003";
const generationId = "00000000-0000-4000-8000-000000000004";
const retryId = "00000000-0000-4000-8000-000000000005";
const business = { ...emptyBusiness, businessName: "Example", businessType: "Plumber", city: "York" };
const input = { accountId, templateId: "showcase", siteName: "Example", subdomain: "example",
  timezone: "UTC", business };
const page = premiumTemplates.showcase.pages[0];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "local-test-key");
  mocks.begin.mockResolvedValue(generationId);
  const pending = structuredClone(page.data);
  pending.content.forEach(({ props }) => { props.__aiPending = "[Finish the AI build]"; });
  mocks.copy.mockResolvedValue({ status: "success", siteId, editorPageId: pageId,
    checkpoints: [{ retryId, pageId, slug: page.slug, label: page.title, title: page.title, draft: pending }] });
  mocks.fill.mockResolvedValue(page.data);
  mocks.checkpoint.mockResolvedValue(true);
  mocks.requireUser.mockResolvedValue({ supabase: {
    from: (table: string) => table === "sites"
      ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { business: {}, draft_header: null }, error: null }) }) }) }) }
      : { select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: pageId, slug: page.slug, title: page.title, draft_data: page.data }], error: null }) }) }) },
  } });
});

describe("template AI build orchestration", () => {
  it("copies and prepares checkpoints together, then saves a filled draft without pending markers", async () => {
    const progress = vi.fn();
    const result = await buildTemplateSite(input, progress);
    expect(mocks.copy).toHaveBeenCalledWith(expect.objectContaining({ templateId: "showcase" }), {
      generationId, business: { ...business, audiences: [], description: "", socialLinks: [] },
    });
    expect(progress).toHaveBeenCalledWith({ message: "Your copied site and page checkpoints are ready.", siteId });
    const filledDraft = mocks.fill.mock.calls[0][1] as typeof page.data;
    expect(filledDraft.content.every(({ props }) => !("__aiPending" in props))).toBe(true);
    expect(mocks.checkpoint).toHaveBeenCalledWith(accountId, generationId, retryId, page.data);
    expect(mocks.complete).toHaveBeenCalledWith(accountId, generationId);
    expect(result.pages).toEqual([{ slug: page.slug, label: page.title, pageId, built: true }]);
  });

  it("preserves an omitted primary action for the template header fallback", async () => {
    await buildTemplateSite(input);
    const options = mocks.copy.mock.calls[0][1];
    expect(options.business).not.toHaveProperty("primaryAction");
    await buildTemplateSite({ ...input, business: { ...business, primaryAction: "book" } });
    expect(mocks.copy.mock.calls[1][1].business.primaryAction).toBe("book");
  });

  it("passes brand colors to the atomic copy without adding them to Business", async () => {
    await buildTemplateSite({ ...input, primaryColor: "#123456", secondaryColor: "" });
    expect(mocks.copy.mock.calls[0][1]).toMatchObject({ primaryColor: "#123456" });
    expect(mocks.copy.mock.calls[0][1]).not.toHaveProperty("secondaryColor");
    expect(mocks.copy.mock.calls[0][1].business).not.toHaveProperty("primaryColor");
  });

  it("finalizes checkpoints rather than cancelling after a malformed committed response", async () => {
    mocks.copy.mockResolvedValue({ status: "success", siteId, editorPageId: pageId, checkpoints: [] });
    await expect(buildTemplateSite(input)).rejects.toThrow("Your site was copied.");
    expect(mocks.complete).toHaveBeenCalledWith(accountId, generationId);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.fill).not.toHaveBeenCalled();
  });

  it("does not cancel an existing reservation when a competing creation fails", async () => {
    mocks.copy.mockResolvedValue({ status: "error", message: "Already being created" });
    await expect(buildTemplateSite({ ...input, generationId })).rejects.toThrow("Already being created");
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("releases a new reservation when copying fails", async () => {
    mocks.copy.mockResolvedValue({ status: "error", message: "Site limit reached" });
    await expect(buildTemplateSite(input)).rejects.toThrow("Site limit reached");
    expect(mocks.cancel).toHaveBeenCalledWith(accountId, generationId);
  });

  it("refuses a prohibited business before copying a template and releases the reservation", async () => {
    mocks.moderate.mockRejectedValue(new AiUserError("We can't build a site for this business."));
    await expect(buildTemplateSite(input)).rejects.toThrow("can't build");
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalledWith(accountId, generationId);
  });

  it("does not cancel a shared recommendation when moderation refuses it", async () => {
    mocks.moderate.mockRejectedValue(new AiUserError("We can't build a site for this business."));
    await expect(buildTemplateSite({ ...input, generationId })).rejects.toThrow("eligible for release");
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it("keeps a failed page checkpoint available for retry", async () => {
    mocks.fill.mockRejectedValue(new Error("The template page failed validation. Its draft was not changed."));
    const result = await buildTemplateSite(input);
    expect(result.pages).toEqual([{ slug: page.slug, label: page.title, pageId, built: false, retryId }]);
    expect(mocks.checkpoint).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith(accountId, generationId);
  });

  it("stops further generation if a provider or accounting call fails", async () => {
    mocks.fill.mockRejectedValue(new Error("AI usage needs reconciliation"));
    await expect(buildTemplateSite(input)).rejects.toBeInstanceOf(AiUserError);
    expect(mocks.checkpoint).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith(accountId, generationId);
  });

  it("reports a reconciliation reference if checkpoint finalization fails", async () => {
    mocks.fill.mockRejectedValue(new Error("AI usage needs reconciliation"));
    mocks.complete.mockRejectedValue(new Error("database details"));
    await expect(buildTemplateSite(input)).rejects.toThrow(`reference ${generationId} before retrying`);
  });

  it("reports a reconciliation reference if an unstarted reservation cannot be released", async () => {
    mocks.copy.mockRejectedValue(new Error("Creation failed"));
    mocks.cancel.mockRejectedValue(new Error("database details"));
    await expect(buildTemplateSite(input)).rejects.toThrow(`reference ${generationId} before retrying`);
  });

  it("releases the recommendation reservation if its proposal fails", async () => {
    mocks.requireUser.mockResolvedValue({ supabase: { from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "one" }, { id: "two" }], error: null }) }) }),
    }) } });
    mocks.recommend.mockRejectedValue(new Error("Invalid proposal"));
    await expect(recommendTemplateBuild({ accountId, business })).rejects.toThrow("Invalid proposal");
    expect(mocks.cancel).toHaveBeenCalledWith(accountId, generationId);
  });
});
