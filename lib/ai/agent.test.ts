import { describe, expect, it } from "vitest";
import { defaultHeader } from "@/lib/header";
import { puckConfig } from "@/lib/puck/config";
import { contrastRatio } from "@/lib/theme/presets";
import { makeToolResult } from "./agent";

type Changeset = Parameters<typeof makeToolResult>[2];
type Context = Parameters<typeof makeToolResult>[3];
type Section = { type: string; props: Record<string, unknown> };

const siteId = "00000000-0000-4000-8000-000000000010";
const accountId = "00000000-0000-4000-8000-000000000011";
const pageId = "00000000-0000-4000-8000-000000000012";
// These tools only touch the changeset sandbox, never the database.
const context = { accountId, siteId } as Context;

const defaults = (type: keyof typeof puckConfig.components) =>
  structuredClone(puckConfig.components[type].defaultProps) as Record<string, unknown>;
function staged(): Changeset {
  const content: Section[] = [
    { type: "Hero", props: { ...defaults("Hero"), id: "hero", backgroundImage: "/samples/tools.jpg" } },
    { type: "Section", props: { ...defaults("Section"), id: "custom", rows: [{ type: "Row", props: { ...defaults("Row"), id: "row", columns: [
      { type: "Column", props: { ...defaults("Column"), id: "column", content: [
        { type: "Heading", props: { ...defaults("Heading"), id: "heading", text: "Original" } },
        { type: "Embed", props: { id: "embed", code: "<secret>" } },
      ] } },
    ] } }] } },
    { type: "Footer", props: { ...defaults("Footer"), id: "footer" } },
  ];
  const snapshot: Changeset["working"] = {
    site: { id: siteId, account_id: accountId, name: "Example", theme: {}, draft_theme: null, draft_header: null, business: {}, seo: {} },
    theme: { colors: { background: "#ffffff", text: "#111111" } },
    header: defaultHeader("Example"),
    footer: defaults("Footer"),
    pages: [{ id: pageId, site_id: siteId, slug: "", title: "Home", nav_label: "Home", hide_from_menu: false,
      draft_data: { root: { props: {} }, content }, seo: {}, sort_order: 0, published_at: null }],
    posts: [],
    blogSettings: {},
  };
  return { version: 1, siteId, baseline: structuredClone(snapshot), working: snapshot, changes: [] };
}
const sections = (snapshot: Changeset["working"]) => (snapshot.pages[0].draft_data as { content: Section[] }).content;
const run = (changeset: Changeset, name: string, input: unknown) => makeToolResult(name, input, changeset, context);

describe("AI agent tool guardrails", () => {
  it("accepts only configured fields and layout choices, and keeps images and embed code out of reach", async () => {
    const changeset = staged();
    await run(changeset, "update_section_props", { pageId, sectionId: "hero", props: { heading: "Reliable local plumbers" } });
    expect(sections(changeset.working)[0].props).toMatchObject({ id: "hero", heading: "Reliable local plumbers", backgroundImage: "/samples/tools.jpg" });
    expect(sections(changeset.baseline)[0].props.heading).not.toBe("Reliable local plumbers");
    expect(changeset.changes).toEqual([expect.objectContaining({ kind: "section_props", pageId, patches: expect.arrayContaining([
      expect.objectContaining({ path: ["pages", { id: pageId }, "draft_data", "content", { id: "hero" }, "props", "heading"] }),
    ]) })]);

    for (const [sectionId, props, message] of [
      ["hero", { unknown: "x" }, "Unsupported section property"],
      ["hero", { variant: "diagonal" }, "Invalid option"],
      ["hero", { backgroundImage: "https://example.com/unapproved.jpg" }, "set_image"],
      ["embed", { code: "<script>alert(1)</script>" }, "does not support AI content editing"],
      ["footer", { tagline: "Edited as a section" }, "not on this page"],
    ] as const) {
      await expect(run(changeset, "update_section_props", { pageId, sectionId, props })).rejects.toThrow(message);
    }
    expect(changeset.changes).toHaveLength(1);
    expect(JSON.stringify(changeset.working)).toContain("<secret>");
  });

  it("applies validated section design edits, rejecting unapproved media and unsupported values", async () => {
    const changeset = staged();
    await run(changeset, "update_section_design", { pageId, sectionId: "hero", design: { shadow: "soft" } });
    expect(sections(changeset.working)[0].props.design).toMatchObject({ shadow: "soft" });
    for (const design of [
      { shadow: "0 0 0" },
      { spacing: { mobile: { paddingTop: 999 } } },
      { background: { type: "image", images: ["https://example.com/unapproved.jpg"] } },
    ]) await expect(run(changeset, "update_section_design", { pageId, sectionId: "hero", design })).rejects.toThrow();
    expect(changeset.changes).toHaveLength(1);
  });

  it("keeps section, theme and header text readable and reports the adjustment", async () => {
    const changeset = staged();
    const result = await run(changeset, "update_section_design", { pageId, sectionId: "hero",
      design: { background: { type: "color", color: "#222222" }, appearance: { mobile: { textColor: "#333333" } } } });
    expect(result).toMatchObject({ warnings: [expect.stringContaining("WCAG AA")] });
    const design = sections(changeset.working)[0].props.design as { appearance: { mobile: { textColor: string } } };
    expect(contrastRatio(design.appearance.mobile.textColor, "#222222")).toBeGreaterThanOrEqual(4.5);

    await run(changeset, "update_theme", { patch: { colors: { background: "#ffffff", text: "#eeeeee" } } });
    const theme = changeset.working.theme as { colors: { text: string } };
    expect(contrastRatio(theme.colors.text, "#ffffff")).toBeGreaterThanOrEqual(4.5);

    const header = defaultHeader("Example");
    await run(changeset, "update_header", { header: { ...header, desktop: { ...header.desktop, color: "#ffffff", textColor: "#fefefe" } } });
    expect(contrastRatio(changeset.working.header.desktop.textColor, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("rejects unknown theme fonts and colors, and header settings outside the schema", async () => {
    const changeset = staged();
    const header = defaultHeader("Example");
    await expect(run(changeset, "update_theme", { patch: { headingFont: "Unknown" } })).rejects.toThrow();
    await expect(run(changeset, "update_theme", { patch: { colors: { accent: "green" } } })).rejects.toThrow();
    await expect(run(changeset, "update_header", { header: { ...header, mobile: { ...header.mobile, layout: "split" } } })).rejects.toThrow();
    await expect(run(changeset, "update_header", { header: { ...header, desktop: { ...header.desktop, css: "anything" } } })).rejects.toThrow();
    expect(changeset.changes).toHaveLength(0);
    expect(changeset.working).toEqual(changeset.baseline);
  });

  it("deletes only top-level sections, never the shared footer, without changing the baseline", async () => {
    const changeset = staged();
    await run(changeset, "delete_section", { pageId, sectionId: "hero" });
    expect(sections(changeset.working).map((item) => item.props.id)).toEqual(["custom", "footer"]);
    expect(sections(changeset.baseline)).toHaveLength(3);
    await expect(run(changeset, "delete_section", { pageId, sectionId: "footer" })).rejects.toThrow("not on this page");
    await expect(run(changeset, "move_section", { pageId, sectionId: "row", position: 0 })).rejects.toThrow("not on this page");
  });
});
