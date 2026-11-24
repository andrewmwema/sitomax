import { describe, expect, it, vi } from "vitest";
import { emptyBusiness } from "@/lib/business";
import { premiumTemplates } from "@/templates/premium";
import { block } from "@/templates/shared";
import type { SiteToolCall } from "./site-tool";
import { fillTemplatePage, templateFillContract } from "./template-fill";

describe("template page fill contract", () => {
  it("collects copy from every master page without modifying any master", () => {
    for (const template of Object.values(premiumTemplates)) {
      for (const page of template.pages) {
        const before = structuredClone(page.data);
        const contract = templateFillContract(page.data);
        expect(contract.fields.length, `${template.key}/${page.slug}`).toBeGreaterThan(0);
        const values = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
          [key, sampleReview ? "[Add a real review]" : "Replacement"]));
        const result = contract.apply({ fields: values });
        expect(page.data).toEqual(before);
        expect(result.content.map(({ type, props }) => ({ type, id: props.id, design: props.design, variant: props.variant })))
          .toEqual(before.content.map(({ type, props }) => ({ type, id: props.id, design: props.design, variant: props.variant })));
        expect(result.content[0]).toEqual(before.content[0]);
        expect(result.content.at(-1)).toEqual(before.content.at(-1));
      }
    }
  });

  it("rejects extra fields, oversized values and fabricated reviews", () => {
    const data = structuredClone(premiumTemplates.showcase.pages[0].data);
    data.content.push(block("Testimonials", "sample-reviews", {}));
    const contract = templateFillContract(data);
    const values = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
      [key, sampleReview ? "[Add a real review]" : "Replacement"]));
    const review = contract.fields.find((field) => field.sampleReview);
    expect(review).toBeDefined();
    expect(() => contract.apply({ fields: { ...values, extra: "untrusted" } })).toThrow();
    expect(() => contract.apply({ fields: { ...values, [review!.key]: "A real customer loved it" } })).toThrow();
    const limited = contract.fields.find((field) => field.maxLength < 1000)!;
    expect(() => contract.apply({ fields: { ...values, [limited.key]: "x".repeat(limited.maxLength + 1) } })).toThrow();
  });

  it("preserves nested images and links while replacing text", () => {
    const data = structuredClone(premiumTemplates.showcase.pages[0].data);
    const contract = templateFillContract(data);
    const values = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
      [key, sampleReview ? "[Add a real review]" : "Replacement"]));
    const result = contract.apply({ fields: values });
    const original = data.content.find((item) => item.type === "Services")!;
    const updated = result.content.find((item) => item.type === "Services")!;
    const before = original.props.services as { title: string; image: string; actionLink: string }[];
    const after = updated.props.services as typeof before;
    expect(after[0].title).toBe("Replacement");
    expect(after[0].image).toBe(before[0].image);
    expect(after[0].actionLink).toEqual(before[0].actionLink);
  });

  it("requests and validates copy before producing a separate draft", async () => {
    const page = premiumTemplates.showcase.pages[0];
    const contract = templateFillContract(page.data);
    const fields = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
      [key, sampleReview ? "[Add a real review]" : "Replacement"]));
    const call = vi.fn().mockResolvedValue({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: "fill_template_page", id: "call", input: { fields },
    }] });
    const result = await fillTemplatePage(call as SiteToolCall, page.data,
      { ...emptyBusiness, businessName: "Example", businessType: "Plumber", city: "York" },
      { title: page.title, slug: page.slug });
    expect(result).not.toBe(page.data);
    expect(result.content.find((item) => item.type === "Hero")?.props.heading).toBe("Replacement");
    expect(call).toHaveBeenCalledTimes(1);
  });
});
