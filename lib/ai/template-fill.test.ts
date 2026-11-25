import { describe, expect, it, vi } from "vitest";
import { emptyBusiness } from "@/lib/business";
import { premiumTemplates } from "@/templates/premium";
import { block } from "@/templates/shared";
import type { SiteToolCall } from "./site-tool";
import { fillTemplatePage, templateFillContract } from "./template-fill";

function imageSuggestions(contract: ReturnType<typeof templateFillContract>) {
  return Object.fromEntries(contract.imageSlots.map(({ key }) => [key, { query: "plumber tools", alt: "Plumbing tools" }]));
}

describe("template page fill contract", () => {
  it("collects copy from every master page without modifying any master", () => {
    for (const template of Object.values(premiumTemplates)) {
      for (const page of template.pages) {
        const before = structuredClone(page.data);
        const contract = templateFillContract(page.data);
        expect(contract.fields.length, `${template.key}/${page.slug}`).toBeGreaterThan(0);
        const values = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
          [key, sampleReview ? "[Add a real review]" : "Replacement"]));
        const result = contract.apply({ fields: values, hiddenSections: [], images: imageSuggestions(contract) });
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
    const images = imageSuggestions(contract);
    expect(() => contract.apply({ fields: { ...values, extra: "untrusted" }, hiddenSections: [], images })).toThrow();
    expect(() => contract.apply({ fields: { ...values, [review!.key]: "A real customer loved it" }, hiddenSections: [], images })).toThrow();
    const limited = contract.fields.find((field) => field.maxLength < 1000)!;
    expect(() => contract.apply({ fields: { ...values, [limited.key]: "x".repeat(limited.maxLength + 1) }, hiddenSections: [], images })).toThrow();
    const seo = contract.fields.find((field) => field.label === "seoTitle")!;
    expect(() => contract.apply({ fields: { ...values, [seo.key]: " " }, hiddenSections: [], images })).toThrow();
  });

  it("preserves nested images and links while replacing text", () => {
    const data = structuredClone(premiumTemplates.showcase.pages[0].data);
    const contract = templateFillContract(data);
    const values = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
      [key, sampleReview ? "[Add a real review]" : "Replacement"]));
    const result = contract.apply({ fields: values, hiddenSections: [], images: imageSuggestions(contract) });
    const original = data.content.find((item) => item.type === "Services")!;
    const updated = result.content.find((item) => item.type === "Services")!;
    const before = original.props.services as { title: string; image: string; actionLink: string }[];
    const after = updated.props.services as typeof before;
    expect(after[0].title).toBe("Replacement");
    expect(after[0].image).toBe(before[0].image);
    expect(after[0].actionLink).toEqual(before[0].actionLink);
  });

  it("preserves form identifiers and image alt text", () => {
    const data = structuredClone(premiumTemplates.showcase.pages.find(({ slug }) => slug === "contact")!.data);
    const contract = templateFillContract(data);
    const values = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
      [key, sampleReview ? "[Add a real review]" : "Replacement"]));
    const result = contract.apply({ fields: values, hiddenSections: [], images: imageSuggestions(contract) });
    const before = data.content.find((item) => item.type === "ContactForm")!;
    const after = result.content.find((item) => item.type === "ContactForm")!;
    expect(after.props.formName).toEqual(before.props.formName);
    expect(after.props.imageAlt).toEqual(before.props.imageAlt);
  });

  it("requests and validates copy before producing a separate draft", async () => {
    const page = premiumTemplates.showcase.pages[0];
    const contract = templateFillContract(page.data);
    const fields = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
      [key, sampleReview ? "[Add a real review]" : "Replacement"]));
    const call = vi.fn().mockResolvedValue({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: "fill_template_page", id: "call", input: { fields, hiddenSections: [], images: imageSuggestions(contract) },
    }] });
    const result = await fillTemplatePage(call as SiteToolCall, page.data,
      { ...emptyBusiness, businessName: "Example", businessType: "Plumber", city: "York" },
      { title: page.title, slug: page.slug });
    expect(result).not.toBe(page.data);
    expect(result.content.find((item) => item.type === "Hero")?.props.heading).toBe("Replacement");
    expect(result.root.props).toMatchObject({ title: "Replacement", seoTitle: "Replacement", description: "Replacement" });
    expect(call.mock.calls[0][1][0].content).toContain("may repurpose its copy and draft title");
    expect(call.mock.calls[0][1][0].content).toContain("page address or menu label has changed");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("requires a reviewed legal placeholder and refuses generated rich-text links", () => {
    const page = premiumTemplates.showcase.pages.find(({ slug }) => slug === "privacy")!;
    const contract = templateFillContract(page.data, "privacy");
    const fields = Object.fromEntries(contract.fields.map(({ key, requiredText, sampleReview }) =>
      [key, requiredText ?? (sampleReview ? "[Add a real review]" : "Replacement")]));
    const legal = contract.fields.find(({ requiredText }) => requiredText)!;
    expect(legal.requiredText).toContain("[Add your reviewed privacy policy]");
    const images = imageSuggestions(contract);
    expect(() => contract.apply({ fields: { ...fields, [legal.key]: "<p>We never share your information.</p>" }, hiddenSections: [], images })).toThrow();
    const rich = contract.fields.find(({ richText, requiredText }) => richText && !requiredText)!;
    expect(() => contract.apply({ fields: { ...fields, [rich.key]: '<a href="https://example.com">Link</a>' }, hiddenSections: [], images })).toThrow();
    expect(contract.apply({ fields, hiddenSections: [], images }).content).toHaveLength(page.data.content.length);
  });

  it("only hides listed optional sections, retaining their content and existing design", () => {
    const data = structuredClone(premiumTemplates.showcase.pages[0].data);
    data.content.push(block("Testimonials", "sample-reviews", { design: { settings: { fullBleed: false } } }));
    const contract = templateFillContract(data);
    const fields = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
      [key, sampleReview ? "[Add a real review]" : "Replacement"]));
    const section = contract.optionalSections.find(({ type }) => type === "Testimonials")!;
    const images = imageSuggestions(contract);
    const result = contract.apply({ fields, hiddenSections: [section.key], images });
    expect(result.content.at(-1)?.props.design).toMatchObject({ settings: {
      fullBleed: false, hideOnDesktop: true, hideOnTablet: true, hideOnMobile: true,
    } });
    expect(data.content.at(-1)?.props.design).toEqual({ settings: { fullBleed: false } });
    expect(() => contract.apply({ fields, hiddenSections: ["section_1"], images })).toThrow();
    expect(() => contract.apply({ fields, hiddenSections: [section.key, section.key], images })).toThrow();
  });

  it("stores image suggestions by field path without replacing template images", () => {
    const data = structuredClone(premiumTemplates.showcase.pages[0].data);
    const contract = templateFillContract(data);
    const fields = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
      [key, sampleReview ? "[Add a real review]" : "Replacement"]));
    const slot = contract.imageSlots.find(({ section, name }) => section === "Services" && name === "services[0].image")!;
    expect(slot).toBeDefined();
    const images = imageSuggestions(contract);
    const result = contract.apply({ fields, hiddenSections: [], images });
    const service = result.content.find(({ type }) => type === "Services")!;
    expect(service.props.__aiImageSuggestions).toMatchObject({ [slot.name]: images[slot.key] });
    expect((service.props.services as { image: string }[])[0].image)
      .toBe((data.content.find(({ type }) => type === "Services")!.props.services as { image: string }[])[0].image);
    expect(() => contract.apply({ fields, hiddenSections: [], images: { ...images, [slot.key]: { query: "", alt: "Tools" } } })).toThrow();
  });

  it("includes empty optional image fields without suggesting invented team portraits", () => {
    const data = structuredClone(premiumTemplates.showcase.pages[0].data);
    const services = data.content.find(({ type }) => type === "Services")!;
    const item = (services.props.services as Record<string, unknown>[])[0];
    delete item.image;
    data.content.push(block("Team", "team", {}));
    const contract = templateFillContract(data);
    expect(contract.imageSlots.some(({ section, name }) => section === "Services" && name === "services[0].image")).toBe(true);
    expect(contract.imageSlots.some(({ section }) => section === "Team")).toBe(false);
    const fields = Object.fromEntries(contract.fields.map(({ key, sampleReview }) =>
      [key, sampleReview ? "[Add a real review]" : "Replacement"]));
    const result = contract.apply({ fields, hiddenSections: [], images: imageSuggestions(contract) });
    const filled = result.content.find(({ type }) => type === "Services")!;
    expect(filled.props.__aiImageSuggestions).toMatchObject({ "services[0].image": { query: "plumber tools" } });
    expect((filled.props.services as Record<string, unknown>[])[0].image).toBeUndefined();
  });
});
