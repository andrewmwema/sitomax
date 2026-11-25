import { describe, expect, it, vi } from "vitest";
import { emptyBusiness } from "@/lib/business";
import { moderateTemplateBusiness } from "./template-moderation";
import type { SiteToolCall } from "./site-tool";

const business = { ...emptyBusiness, businessName: "Example", businessType: "Shop", city: "York" };

describe("template business moderation", () => {
  it("allows a validated safe classification", async () => {
    const call = vi.fn().mockResolvedValue({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: "check_business", id: "call", input: { allowed: true },
    }] });
    await expect(moderateTemplateBusiness(call as SiteToolCall, business)).resolves.toBeUndefined();
  });

  it("refuses a prohibited classification without another model call", async () => {
    const call = vi.fn().mockResolvedValue({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: "check_business", id: "call", input: { allowed: false },
    }] });
    await expect(moderateTemplateBusiness(call as SiteToolCall, business)).rejects.toThrow("can't build");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("does not retry a provider refusal", async () => {
    const call = vi.fn().mockResolvedValue({ stop_reason: "refusal", content: [] });
    await expect(moderateTemplateBusiness(call as SiteToolCall, business)).rejects.toThrow("can't build");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("fails closed after two invalid classifications", async () => {
    const call = vi.fn().mockResolvedValue({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: "check_business", id: "call", input: { allowed: "maybe" },
    }] });
    await expect(moderateTemplateBusiness(call as SiteToolCall, business)).rejects.toThrow("couldn't check");
    expect(call).toHaveBeenCalledTimes(2);
  });
});
