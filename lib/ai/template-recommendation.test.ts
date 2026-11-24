import { describe, expect, it, vi } from "vitest";
import { emptyBusiness } from "@/lib/business";
import type { SiteToolCall } from "./site-tool";
import { recommendTemplate } from "./template-recommendation";

const business = { ...emptyBusiness, businessName: "Example", businessType: "Design studio", city: "York" };
const templates = [
  { id: "studio", name: "Studio", description: "Creative portfolio", best_for: ["Agencies"] },
  { id: "clarity", name: "Clarity", description: "Professional services", best_for: ["Consultants"] },
];
const response = (input: unknown) => ({
  stop_reason: "tool_use", content: [{ type: "tool_use", id: "call", name: "recommend_templates", input }],
});

describe("template recommendation", () => {
  it("accepts only available distinct designs with short reasons", async () => {
    const call = vi.fn().mockResolvedValue(response({
      recommended: { templateId: "studio", reason: "A creative portfolio fits the business." },
      runnerUp: { templateId: "clarity", reason: "A clear services layout is an alternative." },
    }));
    await expect(recommendTemplate(call as SiteToolCall, business, templates)).resolves.toMatchObject({
      recommended: { templateId: "studio" }, runnerUp: { templateId: "clarity" },
    });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("repairs an invalid recommendation once and rejects a second invalid response", async () => {
    const call = vi.fn().mockResolvedValue(response({
      recommended: { templateId: "not-in-the-catalog", reason: "Invalid" },
      runnerUp: { templateId: "clarity", reason: "Alternative" },
    }));
    await expect(recommendTemplate(call as SiteToolCall, business, templates)).rejects.toThrow("failed validation");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not call the model when there are fewer than two designs", async () => {
    const call = vi.fn();
    await expect(recommendTemplate(call as SiteToolCall, business, templates.slice(0, 1))).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it("requires the core business details before making a recommendation", async () => {
    const call = vi.fn();
    await expect(recommendTemplate(call as SiteToolCall, { ...business, city: " " }, templates)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});
