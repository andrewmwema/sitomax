import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({
  supabase: { from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: mocks.lookup };
    return query;
  } },
}) }));
vi.mock("./client", () => ({ requestAi: mocks.request }));
import { runEditorAi } from "./editor";

const pageId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const accountId = "00000000-0000-4000-8000-000000000003";
const message = (name: string, input: unknown) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", name, input }] });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue({ data: { id: pageId, site: { id: siteId, account_id: accountId, business: { businessName: "Example Co" } } }, error: null });
});

describe("inline text rewrite", () => {
  it("retries invalid tool output once through the metered entry point", async () => {
    mocks.request.mockResolvedValueOnce(message("rewrite_text", { text: 17 }))
      .mockResolvedValueOnce(message("rewrite_text", { text: "Improved copy" }));
    await expect(runEditorAi({ kind: "text", pageId, text: "Original", instruction: "Rewrite" }))
      .resolves.toEqual({ kind: "text", text: "Improved copy" });
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls[1][0].messages[0].content).toContain("validation errors");
    expect(mocks.request.mock.calls[0][0]).toMatchObject({ action: "rewrite_text", accountId, siteId });
  });

  it("does not call AI for inaccessible pages", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    await expect(runEditorAi({ kind: "text", pageId, text: "Copy", instruction: "Rewrite" })).rejects.toThrow("unavailable");
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
