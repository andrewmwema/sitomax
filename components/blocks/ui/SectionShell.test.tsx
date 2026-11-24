import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionShell } from "./SectionShell";

describe("SectionShell contrast", () => {
  it("keeps saved designs on the legacy visual version unless explicitly upgraded", () => {
    const legacy = renderToStaticMarkup(<SectionShell><p>Legacy</p></SectionShell>);
    const refreshed = renderToStaticMarkup(<SectionShell design={{ visualVersion: 2 }}><p>Refreshed</p></SectionShell>);
    expect(legacy).toContain('data-section-visual-version="1"');
    expect(refreshed).toContain('data-section-visual-version="2"');
  });

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

  describe("where a width-capped box sits", () => {
  it("gives each device the margins for its alignment, and hands them on only to boxes with none of their own", () => {
    const html = renderToStaticMarkup(<SectionShell level="column" design={{
      appearance: { desktop: { align: "center" }, tablet: { align: "right" } },
    }}><p>Text</p></SectionShell>);
    // Center: both auto. Right: margin-left auto. Mobile falls back to desktop in the stylesheet.
    expect(html).toContain("--appearance-ml-d:auto;--appearance-mr-d:auto");
    expect(html).toContain("--appearance-ml-t:auto;--appearance-mr-t:0px");
    expect(html).not.toContain("--appearance-ml-m");
    // The inherited values are resolved per device, so a nested box needs no fallback chain.
    expect(html).toContain("--inherit-ml-d:auto;--inherit-mr-d:auto");
    expect(html).toContain("--inherit-ml-t:auto;--inherit-mr-t:0px");
    expect(html).toContain("--inherit-ml-m:auto;--inherit-mr-m:auto");
    const left = renderToStaticMarkup(<SectionShell level="element" design={{ appearance: { mobile: { align: "left" } } }}><p>Text</p></SectionShell>);
    expect(left).toContain("--appearance-ml-m:0px;--appearance-mr-m:auto");
    expect(left).toContain("--inherit-ml-m:0px;--inherit-mr-m:auto");
    expect(left).not.toContain("--inherit-ml-d");
    expect(renderToStaticMarkup(<SectionShell><p>Text</p></SectionShell>)).not.toMatch(/--(?:inherit|appearance)-m[lr]/);
  });
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
