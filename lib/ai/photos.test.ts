import { describe, expect, it } from "vitest";
import { prepareSectionPhotoSuggestions } from "./photos";

describe("generated photo suggestions", () => {
  it("keeps image queries out of rendered URLs and stores suggestions for nested slots", () => {
    const warnings = new Set<string>();
    const props: Record<string, unknown> = {
      images: [{ url: "plumber kitchen sink", alt: "Kitchen sink repair" }, { url: "tools", alt: "" }],
    };
    prepareSectionPhotoSuggestions("Gallery", props, warnings);
    expect(props.images).toEqual([{ url: "", alt: "Kitchen sink repair" }, { url: "", alt: "" }]);
    expect(props.__aiImageSuggestions).toEqual({
      "images[0].url": { query: "plumber kitchen sink", alt: "Kitchen sink repair" },
      "images[1].url": { query: "tools", alt: "tools" },
    });
    expect([...warnings].join(" ")).toContain("Choose suggested photos");
  });

  it("does not suggest fabricated staff or logos and reports invalid URLs", () => {
    const warnings = new Set<string>();
    const team = { members: [{ image: "person", imageAlt: "" }] };
    const logos = { logos: [{ image: "logo" }] };
    const image = { image: "https://example.com/image.jpg", imageAlt: "" };
    prepareSectionPhotoSuggestions("Team", team, warnings);
    prepareSectionPhotoSuggestions("Logos", logos, warnings);
    prepareSectionPhotoSuggestions("ImageWithText", image, warnings);
    expect(team.members[0].image).toBe("");
    expect(logos.logos[0].image).toBe("");
    expect(image.image).toBe("");
    expect([...warnings].join(" ")).toContain("invalid photo search");
  });

  it("does not modify shared footer images", () => {
    const props = { logoUrl: "https://storage.example/logo.png" };
    prepareSectionPhotoSuggestions("Footer", props, new Set());
    expect(props.logoUrl).toBe("https://storage.example/logo.png");
  });
});
