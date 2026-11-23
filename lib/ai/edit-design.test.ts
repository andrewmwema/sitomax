import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/theme/presets";
import { designPatchSchema, editDesign, readableText } from "./edit-design";

describe("AI design edits", () => {
  it("rejects unapproved media and unsupported design values", () => {
    expect(designPatchSchema.safeParse({ background: { type: "video", video: { source: "url", embedUrl: "https://example.com/watch?v=abc" } } }).success).toBe(false);
    expect(designPatchSchema.safeParse({ background: { type: "image", images: ["https://example.com/unapproved.jpg"] } }).success).toBe(false);
    expect(designPatchSchema.safeParse({ spacing: { mobile: { paddingTop: 999 } }, shadow: "0 0 0" }).success).toBe(false);
    expect(designPatchSchema.safeParse({ background: { type: "image", images: ["/samples/tools.jpg"] }, shadow: "soft" }).success).toBe(true);
  });

  it("preserves readable colors and picks an AA alternative for every grayscale backdrop", () => {
    expect(readableText("#123", "#fff")).toBe("#123");
    for (let value = 0; value < 256; value++) {
      const background = `#${value.toString(16).padStart(2, "0").repeat(3)}`;
      expect(contrastRatio(readableText(background, background), background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("adjusts responsive section overrides for contrast, preserving other device spacing", () => {
    const warnings = new Set<string>();
    const theme = { colors: { background: "#fff", text: "#111" } };
    const design = editDesign({ spacing: { tablet: { marginTop: 20 } } }, { spacing: { mobile: { paddingTop: 32 } },
      background: { type: "color", color: "#222" }, appearance: { mobile: { textColor: "#333" } } }, theme, warnings);
    expect(contrastRatio(design.appearance!.mobile!.textColor!, "#222")).toBeGreaterThanOrEqual(4.5);
    expect(design.spacing).toEqual({ tablet: { marginTop: 20 }, mobile: { paddingTop: 32 } });
    expect([...warnings]).toEqual(["Section text color was adjusted to meet WCAG AA contrast."]);
  });
});
