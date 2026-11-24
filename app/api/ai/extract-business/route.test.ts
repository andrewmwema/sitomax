import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), site: vi.fn(), requestAi: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: mocks.getUser }, rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.site }) }) }) }),
}) }));
vi.mock("@/lib/ai/client", () => ({ requestAi: mocks.requestAi }));
import { POST } from "./route";

const accountId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const extracted = {
  businessName: "Example Plumbing", businessType: "Plumber", city: "York", services: ["Drain repairs"],
  difference: "", tone: "", phone: "", email: "", address: "", openingHours: "",
  primaryAction: "book", audiences: ["Homeowners"], description: "Plumbing services for homes in York.",
};
function request(body: unknown = { accountId, siteId, text: "Plumbing services for homes in York." }, origin = "https://agency.example") {
  return new Request("https://agency.example/api/ai/extract-business", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "authenticated-user" } }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_super_admin" ? true : true, error: null }));
  mocks.site.mockResolvedValue({ data: { id: siteId }, error: null });
  mocks.requestAi.mockResolvedValue({
    stop_reason: "tool_use", content: [{ type: "tool_use", name: "extract_business", input: extracted }],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("business description extraction", () => {
  it("uses the metered strict tool and returns validated details without saving them", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ business: extracted });
    expect(mocks.requestAi).toHaveBeenCalledWith(expect.objectContaining({
      accountId, siteId, action: "rewrite_text", usageType: "edit", toolName: "extract_business",
      tools: [expect.objectContaining({ name: "extract_business", strict: true })],
    }));
  });

  it("rejects cross-origin calls and users without account access before using AI", async () => {
    expect((await POST(request(undefined, "https://untrusted.example"))).status).toBe(403);
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_super_admin" ? false : false, error: null }));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.requestAi).not.toHaveBeenCalled();
  });

  it("does not allow owners to extract for a new site", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_account_owner", error: null }));
    expect((await POST(request({ accountId, text: "Example Plumbing serves York." }))).status).toBe(403);
    expect(mocks.requestAi).not.toHaveBeenCalled();
  });

  it("does not return invalid provider output as usable business information", async () => {
    mocks.requestAi.mockResolvedValue({
      stop_reason: "tool_use", content: [{ type: "tool_use", name: "extract_business", input: { ...extracted, primaryAction: "invent" } }],
    });
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: "The business details could not be extracted. Review the description and retry." });
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
  });
});
