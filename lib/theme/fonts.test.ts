import { describe, expect, it } from "vitest";
import { CURATED_FONTS, googleFontsUrl } from "./fonts";
import { buildThemeStyle, themeFonts } from "./presets";
import { themeSchema } from "./schema";

describe("site fonts", () => {
  it("uses preset fonts unless individually overridden", () => {
    expect(themeFonts({})).toEqual(["DM Serif Display", "Inter"]);
    expect(themeFonts({ style: "modern", bodyFont: "Lato" })).toEqual(["Plus Jakarta Sans", "Lato"]);
    expect(buildThemeStyle({ headingFont: "Playfair Display", bodyFont: "Lato" }))
      .toMatchObject({
        "--font-heading": '"Playfair Display", Georgia, serif',
        "--font-body": '"Lato", system-ui, sans-serif',
      });
  });

  it("validates font overrides against the same curated list", () => {
    for (const font of CURATED_FONTS) {
      expect(themeSchema.safeParse({ headingFont: font.name, bodyFont: font.name }).success).toBe(true);
    }
    expect(themeSchema.safeParse({ headingFont: "Unknown Font" }).success).toBe(false);
    expect(themeSchema.safeParse({ bodyFont: 'Inter"; color:red' }).success).toBe(false);
    expect(themeSchema.parse({ headingFont: "Lora", bodyFont: "Lato" }))
      .toEqual({ headingFont: "Lora", bodyFont: "Lato" });
  });

  it("requests only the chosen families, deduplicated and with supported weights", () => {
    const same = new URL(googleFontsUrl(["Inter", "Inter"]));
    expect(same.searchParams.getAll("family")).toEqual(["Inter:wght@400;600;700"]);
    expect(same.searchParams.get("display")).toBe("swap");
    const different = new URL(googleFontsUrl(["DM Serif Display", "Lato"]));
    expect(different.searchParams.getAll("family"))
      .toEqual(["DM Serif Display:wght@400", "Lato:wght@400;700"]);
  });
});
