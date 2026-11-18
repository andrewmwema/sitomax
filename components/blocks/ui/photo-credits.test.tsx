import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotoCredits } from "./photo-credits";

describe("legacy stock photo attribution", () => {
  it("preserves Unsplash links and does not render credits for newly imported photos", () => {
    const html = renderToStaticMarkup(<PhotoCredits credits={[{
      url: "https://images.unsplash.com/photo-1", alt: "Stock photo", photographer: "Photographer",
      photographerUrl: "https://unsplash.com/@photographer?utm_source=agency_sites",
      sourceUrl: "https://unsplash.com/photos/photo-1?utm_source=agency_sites",
    }]} />);
    expect(html).toContain("Photographer"); expect(html).toContain("Unsplash");
    expect(html).toContain('href="https://unsplash.com/@photographer?utm_source=agency_sites"');
    expect(renderToStaticMarkup(<PhotoCredits credits={[]} />)).toBe("");
  });
});
