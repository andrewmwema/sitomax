import { describe, expect, it } from "vitest";
import {
  defaultHeader, editHeader, editorHeader, extractNavigation, headerColors, headerDesign, headerSchema, HEADER_LAYOUTS, resolveHeaderLink, headerMigrationMissing,
} from "./header";
import { contrastRatio } from "./theme/contrast";

describe("global header contract", () => {
  it("only identifies missing header migrations, not unrelated database failures", () => {
    expect(headerMigrationMissing({ code: "42703", message: "column sites.draft_header does not exist" })).toBe(true);
    expect(headerMigrationMissing({ code: "42703", message: "column page_versions.header does not exist" })).toBe(true);
    expect(headerMigrationMissing({ code: "42501", message: "draft_header access denied" })).toBe(false);
    expect(headerMigrationMissing({ code: "42703", message: "column sites.business does not exist" })).toBe(false);
  });
  it("derives compact defaults from desktop and keeps tablet overrides independent", () => {
    const header = editHeader(defaultHeader("Example"), { device: "desktop", settings: { color: "#112233", font: "Lora" } });
    expect(headerDesign(header, "mobile")).toMatchObject({ color: "#112233", font: "Lora", height: 68, layout: "right-toggle" });
    const tablet = editHeader(header, { device: "tablet", settings: { follow: "desktop", height: 76 } });
    expect(headerDesign(tablet, "tablet")).toMatchObject({ layout: "balanced", height: 76 });
    expect(headerDesign(tablet, "desktop").height).toBe(84);
    const customized = editHeader(header, { device: "tablet", settings: { layout: "left-toggle", height: 72 } });
    const following = editHeader(customized, { device: "tablet", settings: { follow: "desktop" } });
    expect(headerDesign(following, "tablet")).toMatchObject({ layout: "balanced", height: 72 });
  });
  it("supports all eight desktop layouts without replacing content or colors", () => {
    const header = editHeader(defaultHeader("Example"), { device: "desktop", settings: { color: "#123456", padding: 32 } });
    for (const { id } of HEADER_LAYOUTS) {
      const next = editHeader(header, { device: "desktop", settings: { layout: id } });
      expect(next.logo).toEqual(header.logo);
      expect(next.menu).toEqual(header.menu);
      expect(next.desktop.color).toEqual(header.desktop.color);
    }
  });
  it("keeps typed and legacy header links on the draft preview host/path", () => {
    const pageId = "00000000-0000-4000-8000-000000000001";
    const context = { pages: { [pageId]: "/s/example/contact?preview=1" } };
    expect(resolveHeaderLink("/contact#form", context).href).toBe("/s/example/contact?preview=1#form");
    expect(resolveHeaderLink("/contact?source=header#form", context).href).toBe("/s/example/contact?preview=1&source=header#form");
    expect(resolveHeaderLink({ type: "page", pageId, newTab: true }, context)).toMatchObject({
      href: "/s/example/contact?preview=1", newTab: true, broken: false,
    });
  });
  it("rejects code, unsupported properties/devices/fonts and multi-level dropdowns", () => {
    for (const value of [
      { desktop: { css: "position:fixed" } }, { desktop: { font: "Invented" } },
      { logo: { href: { type: "url", url: "javascript:alert(1)" } } }, { logo: { href: "javascript:alert(1)" } },
      { desktop: { image: "data:image/svg+xml,test" } }, { mobile: { layout: "split" } },
      { menu: { items: [{ label: "Parent", href: "/", children: [{ label: "Child", href: "/", children: [] }] }] } },
    ]) expect(headerSchema.safeParse(value).success).toBe(false);
  });
  it("migrates Navigation and old history without mutating sections, root settings or zones", () => {
    const body = { type: "Text", props: { id: "copy", text: "Keep me" } };
    const data = { root: { props: { title: "Home" } }, zones: {}, content: [
      { type: "Navigation", props: { businessName: "Example", buttonText: "Call", buttonLink: "tel:+15551234567", variant: "dark" } }, body,
    ] };
    const result = extractNavigation(data);
    expect(result.data).toEqual({ ...data, content: [body] });
    expect(result.header).toMatchObject({ logo: { text: "Example" }, cta: { text: "Call", href: "tel:+15551234567" }, desktop: { layout: "right", color: "#17202b" } });
    expect(data.content).toHaveLength(2);
    expect(extractNavigation(result.data).header).toBeUndefined();
  });
  it("ensures AA text/panel/scroll contrast, backing gradients when no common shade exists", () => {
    for (const color of ["#ffffff", "#000000", "#777777", "#1a5533"]) {
      const design = { ...headerDesign(defaultHeader(), "desktop"), color, panelColor: color, scrollColor: color,
        textColor: color, panelTextColor: color, hoverColor: color };
      const colors = headerColors(design);
      expect(contrastRatio(colors.foreground, color)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.hover, color)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.panel, color)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.scrolled, color)).toBeGreaterThanOrEqual(4.5);
    }
    const colors = headerColors({ ...headerDesign(defaultHeader(), "desktop"), background: "gradient", color: "#000000", gradientTo: "#ffffff" });
    expect(colors.backing).toBe("#000000");
    expect(contrastRatio(colors.foreground, colors.backing!)).toBeGreaterThanOrEqual(4.5);
    expect(editorHeader({ root: {}, content: [] })).toBeUndefined();
  });
});
