import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionShell } from "./SectionShell";

describe("SectionShell contrast", () => {
  it("uses readable text when an appearance text color misses contrast on its solid background", () => {
    const html = renderToStaticMarkup(
      <SectionShell
        design={{ appearance: { desktop: { backgroundColor: "#ffffff", textColor: "#ffffff" } } }}
      >
        <p>Readable</p>
      </SectionShell>,
    );
    expect(html).toContain("--appearance-text-d:#17202b");
    expect(html).not.toContain("--appearance-text-d:#ffffff");
  });

  describe("section layout settings", () => {
    it("applies width and responsive alignment without changing the defaults", () => {
      const defaults = renderToStaticMarkup(<SectionShell><p>Text</p></SectionShell>);
      expect(defaults).not.toContain("data-content-width");
      expect(defaults).not.toContain("data-section-align");
      const html = renderToStaticMarkup(<SectionShell design={{
        settings: { contentWidth: "narrow" },
        appearance: { desktop: { align: "center" }, mobile: { align: "left" } },
      }}><p>Text</p></SectionShell>);
      expect(html).toContain("--section-content-width:720px");
      expect(html).toContain('data-section-align-d="center"');
      expect(html).toContain('data-section-align-t="center"');
      expect(html).toContain('data-section-align-m="left"');
    });
  });

  it("chooses a readable appearance text color when none was specified", () => {
    const html = renderToStaticMarkup(
      <SectionShell design={{ appearance: { desktop: { backgroundColor: "#ffffff" } } }}>
        <p>Readable</p>
      </SectionShell>,
    );
    expect(html).toContain("--appearance-text-d:#17202b");
  });
});
