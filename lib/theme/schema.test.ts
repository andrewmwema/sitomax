import { describe, expect, it } from "vitest";
import { themeSchema } from "./schema";

describe("site theme schema", () => {
  it("accepts an optional favicon URL and removal value", () => {
    expect(themeSchema.parse({ faviconUrl: "https://cdn.example.test/favicon.png" })).toEqual({
      faviconUrl: "https://cdn.example.test/favicon.png",
    });
    expect(themeSchema.parse({ faviconUrl: "" })).toEqual({ faviconUrl: "" });
  });

  it("validates the site-wide mobile sticky CTA destination", () => {
    expect(themeSchema.parse({ mobileStickyCta: { enabled: true } }).mobileStickyCta).toEqual({
      enabled: true,
      label: "Get a quote",
      href: "/contact",
    });
    expect(themeSchema.safeParse({ mobileStickyCta: { enabled: true, href: "//example.com" } }).success).toBe(false);
    expect(themeSchema.safeParse({ mobileStickyCta: { enabled: true, href: "javascript:alert(1)" } }).success).toBe(false);
    expect(themeSchema.safeParse({ mobileStickyCta: { enabled: true, href: "tel:+15551234567" } }).success).toBe(true);
  });
});
