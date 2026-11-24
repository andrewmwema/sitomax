import { describe, expect, it } from "vitest";
import { buildThemeStyle, type SiteTheme } from "./presets";
import { applyQuickStyle, quickStyleSchema } from "./quick-styles";
import { themeSchema } from "./schema";

describe("instant theme presets", () => {
  const theme: SiteTheme = { style: "modern", headingFont: "Inter", colors: { primary: "#0b5cab", text: "#17202b" }, logoUrl: "https://example.com/logo.png" };

  it("applies each preset as a plain theme change and keeps everything else", () => {
    const next = applyQuickStyle(theme, { palette: "forest-green", fonts: "warm", buttons: "pill", corners: "subtle", spacing: "compact" });
    expect(next).toEqual({
      style: "modern", logoUrl: "https://example.com/logo.png", headingFont: "Fraunces", bodyFont: "DM Sans", buttonStyle: "pill", radius: 6, spacing: "compact",
      colors: { primary: "#1d6a43", secondary: "#b98a2f", background: "#fdfdf9", text: "#1a2e22" },
    });
    expect(themeSchema.parse(next)).toEqual(next);
    expect(applyQuickStyle(theme, { buttons: "square" })).toEqual({ ...theme, buttonStyle: "square" });
    expect(theme).not.toHaveProperty("buttonStyle");
    expect(quickStyleSchema.safeParse({ corners: "huge" }).success).toBe(false);
    expect(quickStyleSchema.safeParse({ radius: 4 }).success).toBe(false);
  });

  it("turns the spacing preset into the space every section uses", () => {
    const pad = (spacing?: SiteTheme["spacing"]) => (buildThemeStyle({ ...theme, spacing }) as Record<string, string>)["--section-pad"];
    // Comfortable is the style's own spacing, which is also what a theme without the setting gets.
    expect(pad("comfortable")).toBe(pad());
    expect(pad("compact")).toBe("clamp(40px, 5vw, 64px)");
    expect(pad("spacious")).toBe("clamp(88px, 11vw, 152px)");
  });
});
