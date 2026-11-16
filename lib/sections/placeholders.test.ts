import { describe, expect, it } from "vitest";
import { findUnreplacedPlaceholders } from "./placeholders";

describe("findUnreplacedPlaceholders", () => {
  it("reports sections whose copy still contains [placeholders]", () => {
    const hits = findUnreplacedPlaceholders(
      {
        content: [
          {
            type: "Hero",
            props: {
              id: "a",
              heading: "Welcome",
              badgeText: "Rated [4.9]/5 by [300]+ customers",
              stats: [{ value: "[20]+", label: "Years in business" }],
            },
          },
          { type: "Footer", props: { id: "b", businessName: "Acme Plumbing" } },
        ],
      },
      { Hero: "Hero" },
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ index: 0, blockType: "Hero", label: "Hero" });
    expect(hits[0].snippets).toEqual(
      expect.arrayContaining(["[4.9]", "[300]", "[20]"]),
    );
  });

  it("ignores the design object and returns nothing when clean", () => {
    const hits = findUnreplacedPlaceholders({
      content: [
        {
          type: "Hero",
          props: {
            id: "a",
            heading: "All real copy",
            design: { settings: { anchorId: "[not-copy]" } },
          },
        },
      ],
    });

    expect(hits).toEqual([]);
  });

  it("warns about unreplaced template business details in nested props", () => {
    const hits = findUnreplacedPlaceholders({
      content: [{ type: "Footer", props: { id: "template-footer", businessName: "{{businessName}}", navigation: [{ label: "Visit {{city}}", href: "/contact" }] } }],
    });
    expect(hits[0].snippets).toEqual(["{{businessName}}", "{{city}}"]);
  });
});
