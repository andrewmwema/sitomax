import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiUserError } from "@/lib/ai/errors";

const mocks = vi.hoisted(() => ({ build: vi.fn(), recommend: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/ai/template-build", () => ({ buildTemplateSite: mocks.build, recommendTemplateBuild: mocks.recommend }));
vi.mock("@/lib/ai/usage", () => ({ cancelTemplateBuild: mocks.cancel }));
vi.mock("@/lib/ai/provider-error", () => ({
  AiProviderError: class extends Error {},
  aiErrorMessage: async (_cause: unknown, fallback: string) => fallback,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("template build errors", () => {
  it("sends a safe actionable error over the progress stream", async () => {
    mocks.build.mockRejectedValue(new AiUserError("Your site was copied. Contact your agency before retrying."));
    const response = await POST(new Request("https://agency.example/api/ai/template-build", {
      method: "POST", headers: { origin: "https://agency.example" }, body: JSON.stringify({ mode: "build", input: {} }),
    }));
    expect(JSON.parse((await response.text()).trim())).toEqual({
      type: "error", message: "Your site was copied. Contact your agency before retrying.",
    });
  });
});
