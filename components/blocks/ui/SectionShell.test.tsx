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

  it("chooses a readable appearance text color when none was specified", () => {
    const html = renderToStaticMarkup(
      <SectionShell design={{ appearance: { desktop: { backgroundColor: "#ffffff" } } }}>
        <p>Readable</p>
      </SectionShell>,
    );
    expect(html).toContain("--appearance-text-d:#17202b");
  });
});
