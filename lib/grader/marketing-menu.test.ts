import { describe, expect, it } from "vitest";
import { brand } from "@/lib/brand";
import { emptyBusiness } from "@/lib/business";
import { appendMarketingLinks, marketingGraderMenu } from "./marketing-menu";

describe("marketing grader navigation", () => {
  const menu = { links: [{ label: "Home", href: "/" }], contacts: emptyBusiness };
  it("adds the grader to the marketing site but not client sites", () => {
    const result = marketingGraderMenu(brand.marketingSiteSubdomain, menu);
    expect(result.links).toContainEqual({ label: "Free Website Grade", href: expect.stringMatching(/\/grader$/) });
    expect(result.extraLinks).toHaveLength(1);
    expect(marketingGraderMenu("other-client", menu)).toBe(menu);
  });
  it("adds the link to custom menus without duplicating an existing grader link", () => {
    const extra = marketingGraderMenu(brand.marketingSiteSubdomain, menu).extraLinks!;
    expect(appendMarketingLinks([{ label: "Home", href: "/" }], extra, { pages: {} })).toHaveLength(2);
    expect(appendMarketingLinks([{ label: "Grader", href: "/grader" }], extra, { pages: {} })).toHaveLength(1);
    const id = "96b28c25-ec84-4b9d-847e-1270aec46fd4";
    expect(appendMarketingLinks([{ label: "Grader", href: { type: "page", pageId: id } }],
      extra, { pages: { [id]: "/grader" } })).toHaveLength(1);
  });
});
