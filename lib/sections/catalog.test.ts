import { describe, expect, it } from "vitest";
import { puckConfig } from "@/lib/puck/config";
import { SECTION_CATEGORIES, sectionCatalog } from "./catalog";

describe("section catalog", () => {
  it("has unique design ids", () => {
    const ids = sectionCatalog.map((design) => design.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references blocks and categories that exist", () => {
    for (const design of sectionCatalog) {
      expect(puckConfig.components).toHaveProperty(design.blockType);
      expect(SECTION_CATEGORIES).toContain(design.category);
      expect(design.styles.length).toBeGreaterThan(0);
    }
  });

  it("every block exposes a variant field so designs can switch layout", () => {
    for (const [type, component] of Object.entries(puckConfig.components)) {
      expect(component.fields, `${type} is missing a variant field`).toHaveProperty(
        "variant",
      );
    }
  });
});
