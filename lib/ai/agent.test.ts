import { describe, expect, it, vi } from "vitest";
import { defaultHeader } from "@/lib/header";
import { puckConfig } from "@/lib/puck/config";
import { contrastRatio } from "@/lib/theme/presets";
import { fixtureChangeset, fixtureIds } from "@/test/fixtures/agent-site";
import { makeToolResult, ToolInputError } from "./agent";
import { planAgentApply, type ApplyMeta } from "./agent-apply-plan";
import { createAgentReviewPayload, previewAgentReview } from "./agent-review";
import { SITE_SETTINGS_FIELDS } from "./agent-tools";
import { aiCatalog } from "./site-schemas";

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
const sections = (snapshot: Changeset["working"], page = 0) => (snapshot.pages[page].draft_data as { content: Section[] }).content;
const run = (changeset: Changeset, name: string, input: unknown) => makeToolResult(name, input, changeset, context);
const nested = (snapshot: Changeset["working"], id: string) => {
  const column = ((sections(snapshot)[1].props.rows as Section[])[0].props.columns as Section[])[0];
  return (column.props.content as Section[]).find((item) => item.props.id === id)!;
};
/** The review and apply steps rebuild the result from each change's patches, so they must reproduce it. */
function expectReplays(changeset: Changeset) {
  const review = createAgentReviewPayload(changeset)!;
  const { snapshot, error } = previewAgentReview(review, {});
  expect(error).toBeNull();
  expect(snapshot).toEqual(review.working);
}
const customSection = {
  background: "soft", width: "contained", rowGap: 32, design: {},
  rows: [{ layout: "1-1", gap: 32, reverseOnMobile: false, columns: [
    { surface: "none", verticalAlign: "center", gap: 16, elements: [
      { type: "Heading", text: "Why choose us", level: "h2", align: "left" },
      { type: "Text", text: "Local and **reliable**.\n\nCall [phone].", align: "left" },
      { type: "Button", label: "Contact us", href: "/contact", variant: "primary", size: "md", align: "left" },
    ] },
    { surface: "card", verticalAlign: "center", gap: 16, elements: [
      { type: "Image", query: "plumber at work", alt: "A plumber fixing a sink", aspect: "4/3", fit: "cover", radius: "theme", width: "100", align: "center" },
    ] },
  ] }],
};

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
      ["footer", { tagline: "Edited as a section" }, "update_footer"],
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
    // A setting the header does not have is left out and noted; with nothing else to change, nothing is staged.
    expect(await run(changeset, "update_header", { header: { ...header, desktop: { ...header.desktop, css: "anything" } } }))
      .toEqual({ ok: true, nothingChanged: true, message: expect.stringContaining("Nothing changed"), notes: ["header.desktop.css is not a setting here and was ignored."] });
    expect(changeset.changes).toHaveLength(0);
    expect(changeset.working).toEqual(changeset.baseline);
  });

  it("deletes only top-level sections, never the shared footer, without changing the baseline", async () => {
    const changeset = staged();
    await run(changeset, "delete_section", { pageId, sectionId: "hero" });
    expect(sections(changeset.working).map((item) => item.props.id)).toEqual(["custom", "footer"]);
    expect(sections(changeset.baseline)).toHaveLength(3);
    await expect(run(changeset, "delete_section", { pageId, sectionId: "footer" })).rejects.toThrow("update_footer");
    await expect(run(changeset, "move_section", { pageId, sectionId: "row", position: 0 })).rejects.toThrow("whole sections");
  });

  it("reads custom layouts and searches the site without exposing embed code", async () => {
    const changeset = staged();
    const page = await run(changeset, "get_page", { pageId }) as { sections: { sectionId: string }[] };
    expect(page.sections.map((item) => item.sectionId)).toEqual(["hero", "custom"]);
    expect(JSON.stringify(await run(changeset, "get_section", { pageId, sectionId: "custom" }))).not.toContain("<secret>");
    const text = JSON.stringify(page);
    expect(text).toContain("Original");
    expect(text).not.toContain("<secret>");
    expect(JSON.stringify(await run(changeset, "search_site", { query: "secret" }))).not.toContain("<secret>");
    expect(JSON.stringify(await run(changeset, "get_site_overview", {}))).not.toContain("<secret>");
    expect(JSON.stringify(changeset.working)).toContain("<secret>");
  });

  it("can identify and remove a centered paragraph's indent without rewriting its text", async () => {
    const changeset = staged();
    const column = ((sections(changeset.working)[1].props.rows as Section[])[0].props.columns as Section[])[0];
    (column.props.content as Section[]).push({ type: "Text", props: {
      ...defaults("Text"), id: "intro", align: "center",
      text: '<p style="text-align: center; margin-left: 128px">Hello <strong>there</strong>.</p>',
    } });
    changeset.baseline = structuredClone(changeset.working);
    expect(await run(changeset, "get_section", { pageId, sectionId: "intro" }))
      .toMatchObject({ layoutCheck: { passed: false, problems: [expect.stringContaining("margin-left")] } });
    // The change is answered with the check, so "fixed" has something to stand on.
    expect(await run(changeset, "update_section_props", { pageId, sectionId: "intro", props: {
      text: '<p style="text-align: center">Hello <strong>there</strong>.</p>',
    } })).toMatchObject({ layoutCheck: { passed: true } });
    expect(nested(changeset.working, "intro").props.text).toBe('<p style="text-align: center">Hello <strong>there</strong>.</p>');
    expect(nested(changeset.baseline, "intro").props.text).toContain("128px");
    expectReplays(changeset);
  });

  it("checks the margins behind a centered box, not only its text alignment", async () => {
    const changeset = staged();
    const column = ((sections(changeset.working)[1].props.rows as Section[])[0].props.columns as Section[])[0];
    (column.props.content as Section[]).push({ type: "Text", props: {
      ...defaults("Text"), id: "intro", align: "center", text: "<p>Our services at a glance.</p>",
      design: { spacing: { desktop: { marginLeft: 128 } } },
    } });
    changeset.baseline = structuredClone(changeset.working);
    const read = await run(changeset, "get_section", { pageId, sectionId: "custom" }) as { layoutCheck: { problems: string[] } };
    expect(read.layoutCheck.problems).toEqual([expect.stringMatching(/^Text intro .*off-center on desktop, tablet, mobile, with 128px .* left and 0px .* right.*update_section_design/)]);
    // Setting the alignment again changes nothing about the box, and the result says so.
    expect(await run(changeset, "update_section_props", { pageId, sectionId: "intro", props: { text: "<p>Our services, at a glance.</p>" } }))
      .toMatchObject({ layoutCheck: { passed: false } });
    expect(await run(changeset, "update_section_design", { pageId, sectionId: "intro", design: { spacing: { desktop: { marginLeft: 0 } } } }))
      .toMatchObject({ layoutCheck: { passed: true } });
    // A section with nothing off-center is not given a check to read.
    expect(await run(changeset, "update_section_props", { pageId, sectionId: "heading", props: { text: "Renamed" } })).not.toHaveProperty("layoutCheck");
    expectReplays(changeset);
  });

  it("edits, restyles and sets images on elements nested in a custom layout", async () => {
    const changeset = staged();
    const column = ((sections(changeset.working)[1].props.rows as Section[])[0].props.columns as Section[])[0];
    (column.props.content as Section[]).push({ type: "Image", props: { ...defaults("Image"), id: "image", src: "" } });
    changeset.baseline = structuredClone(changeset.working);

    await run(changeset, "update_section_props", { pageId, sectionId: "heading", props: { text: "Trusted since [year]", level: "h3" } });
    await run(changeset, "update_section_design", { pageId, sectionId: "heading", design: { shadow: "soft" } });
    const photos: Context = { ...context, choosePhoto: async (query, alt) => ({ url: `https://assets.example/${query}.jpg`, alt: alt ?? "Stock photo" }) };
    await makeToolResult("set_image", { pageId, sectionId: "image", field: "src", query: "plumber", alt: "A plumber at work" }, changeset, photos);
    const services = await run(changeset, "insert_section", { pageId, designId: aiCatalog.find((entry) => entry.blockType === "Services")!.id }) as { sectionId: string };
    await makeToolResult("set_image", { pageId, sectionId: services.sectionId, field: "services.0.image", query: "pipes" }, changeset, photos);
    expect((sections(changeset.working).at(-2)!.props.services as Record<string, unknown>[])[0]).toMatchObject({ image: "https://assets.example/pipes.jpg" });
    await expect(makeToolResult("set_image", { pageId, sectionId: "heading", field: "text", query: "pipes" }, changeset, photos)).rejects.toThrow("supported image field");

    expect(nested(changeset.working, "heading").props).toMatchObject({ text: "Trusted since [year]", level: "h3", design: { shadow: "soft" } });
    expect(nested(changeset.working, "image").props).toMatchObject({ src: "https://assets.example/plumber.jpg", alt: "A plumber at work" });
    expect(nested(changeset.baseline, "heading").props.text).toBe("Original");
    expect(changeset.changes).toHaveLength(5);
    expectReplays(changeset);
    // Pickers the AI schemas cannot express stay out of reach.
    await expect(run(changeset, "update_section_props", { pageId, sectionId: "heading", props: { color: "#ff0000" } })).rejects.toThrow("Unsupported section property");
    // Design settings sent with the content are applied as design, not refused.
    await run(changeset, "update_section_props", { pageId, sectionId: "heading", props: { text: "Trusted locally", design: { shadow: "medium" }, textColor: "#111111" } });
    expect(nested(changeset.working, "heading").props).toMatchObject({ text: "Trusted locally", design: { shadow: "medium", appearance: { desktop: { textColor: "#111111" } } } });
    expect(await run(changeset, "update_section_props", { pageId, sectionId: "heading", props: { design: {} } })).toMatchObject({ nothingChanged: true });
  });

  it("keeps links from the link picker and stored images when editing other content", async () => {
    const changeset = staged();
    const hero = sections(changeset.working)[0];
    hero.props.buttonLink = { type: "page", pageId };
    hero.props.stats = Array.from({ length: 14 }, (_, index) => ({ value: String(index), label: "Jobs" }));
    changeset.baseline = structuredClone(changeset.working);

    await run(changeset, "update_section_props", { pageId, sectionId: "hero", props: { heading: "New heading", buttonLink: { type: "page", pageId, anchor: "contact" } } });
    await run(changeset, "update_section_props", { pageId, sectionId: "hero", props: { secondaryButtonLink: "/about", backgroundImage: "" } });
    expect(sections(changeset.working)[0].props).toMatchObject({
      heading: "New heading", buttonLink: { type: "page", pageId, anchor: "contact" }, secondaryButtonLink: "/about", backgroundImage: "",
    });
    expect(sections(changeset.working)[0].props.stats).toHaveLength(14);
    await expect(run(changeset, "update_section_props", { pageId, sectionId: "hero",
      props: { buttonLink: { type: "page", pageId: "00000000-0000-4000-8000-0000000000ff" } } })).rejects.toThrow("not on this site");
    await expect(run(changeset, "update_section_props", { pageId, sectionId: "hero", props: { buttonLink: "javascript:alert(1)" } })).rejects.toThrow();
    expectReplays(changeset);
  });

  it("inserts every curated design, alone, with content, and by switching an existing section", async () => {
    for (const design of aiCatalog.filter((entry) => entry.category !== "Footer")) {
      const changeset = staged();
      await run(changeset, "insert_section", { pageId, designId: design.id, position: 1 });
      await run(changeset, "switch_section_design", { pageId, sectionId: "hero", designId: design.id });
      const [switched, inserted] = sections(changeset.working);
      expect(inserted.type, design.id).toBe(design.blockType);
      expect(switched, design.id).toMatchObject({ type: design.blockType, props: { id: "hero" } });
      if ("variant" in design.props) expect(switched.props.variant, design.id).toBe(design.props.variant);
      expectReplays(changeset);
    }
    const changeset = staged();
    sections(changeset.working)[0].props.heading = "Kept heading";
    await run(changeset, "switch_section_design", { pageId, sectionId: "hero", designId: aiCatalog.find((entry) => entry.blockType === "TextSection")!.id });
    expect(sections(changeset.working)[0].props.heading).toBe("Kept heading");

    const services = aiCatalog.find((entry) => entry.blockType === "Services")!;
    await run(changeset, "insert_section", { pageId, designId: services.id, props: { heading: "Our services", services: [
      { icon: "wrench", title: "Repairs", text: "Leaks and bursts.", image: "", imageAlt: "" },
    ] } });
    expect(sections(changeset.working).at(-2)!.props).toMatchObject({ heading: "Our services", variant: services.props.variant });
    for (const props of [{ variant: "nope" }, { services: [42] }, { nope: true }]) {
      await expect(run(changeset, "insert_section", { pageId, designId: services.id, props })).rejects.toThrow();
    }
    // A list item that names only what it has something to say about is completed, not refused.
    await run(changeset, "insert_section", { pageId, designId: services.id, props: { services: [{ title: "Boiler servicing" }] } });
    expect(sections(changeset.working).at(-2)!.props.services).toEqual([{
      icon: "check", title: "Boiler servicing", text: "", image: "", imageAlt: "", actionText: "", actionLink: "",
    }]);
    await expect(run(changeset, "insert_section", { pageId })).rejects.toThrow("exactly one");
    await expect(run(changeset, "insert_section", { pageId, designId: "nope" })).rejects.toThrow("unavailable");
    expect(await run(changeset, "list_section_designs", { blockType: "Services" })).toMatchObject({
      designs: expect.arrayContaining([expect.objectContaining({ id: services.id })]),
      props: { heading: "rich text (HTML)", services: [expect.objectContaining({ image: expect.stringContaining("set_image") })] },
    });
  });

  it("builds custom layouts from the compact format with empty images, and duplicates them with new ids", async () => {
    const changeset = staged();
    const result = await run(changeset, "insert_section", { pageId, customSection, position: 0 }) as { imagesToSet: unknown[] };
    const [inserted] = sections(changeset.working);
    const text = JSON.stringify(inserted);
    expect(inserted.type).toBe("Section");
    expect(text).toContain("<strong>reliable</strong>");
    expect(text).not.toContain("plumber at work");
    expect(result.imagesToSet).toEqual([expect.objectContaining({ field: "src", query: "plumber at work" })]);

    await run(changeset, "duplicate_section", { pageId, sectionId: "custom" });
    const ids = (item: Section) => [...JSON.stringify(item).matchAll(/"id":"([^"]+)"/g)].map((match) => match[1]);
    const copy = sections(changeset.working).at(-2)!;
    expect(ids(copy)).toHaveLength(ids(sections(changeset.working)[2]).length);
    expect(ids(copy).some((id) => ids(sections(changeset.working)[2]).includes(id))).toBe(false);
    expectReplays(changeset);

    for (const broken of [
      { ...customSection, rows: [{ ...customSection.rows[0], columns: Array.from({ length: 5 }, () => customSection.rows[0].columns[0]) }] },
      { ...customSection, rows: [{ ...customSection.rows[0], columns: [{ ...customSection.rows[0].columns[0], elements: [{ type: "Embed", code: "<script></script>" }] }, customSection.rows[0].columns[1]] }] },
    ]) await expect(run(changeset, "insert_section", { pageId, customSection: broken })).rejects.toThrow();
    expect(changeset.changes).toHaveLength(2);
  });

  it("creates pages with content and the shared footer, at a free address", async () => {
    const changeset = staged();
    changeset.working.footer = { ...changeset.working.footer, tagline: "Shared tagline" };
    changeset.baseline = structuredClone(changeset.working);
    const hero = aiCatalog.find((entry) => entry.blockType === "Hero")!;
    await run(changeset, "create_page", { title: "About us", slug: "about", navLabel: "About", sections: [
      { designId: hero.id, props: { heading: "About [business name]" } }, { customSection },
    ] });
    const created = sections(changeset.working, 1);
    expect(changeset.working.pages[1]).toMatchObject({ slug: "about", title: "About us", nav_label: "About" });
    expect(created.map((item) => item.type)).toEqual(["Hero", "Section", "Footer"]);
    expect(created[0].props.heading).toBe("About [business name]");
    expect(created[2].props).toMatchObject({ tagline: "Shared tagline" });
    expect(created[2].props.id).not.toBe("footer");
    expectReplays(changeset);
    for (const page of [
      { title: "About", slug: "about", navLabel: "About", sections: [] },
      { title: "Admin", slug: "dashboard", navLabel: "Admin", sections: [] },
      { title: "Long", slug: "long", navLabel: "A label of four words", sections: [] },
      { title: "Neither", slug: "neither", navLabel: "Neither", sections: [{ props: { heading: "No design" } }] },
    ]) await expect(run(changeset, "create_page", page)).rejects.toThrow();
    expect(changeset.working.pages).toHaveLength(2);
  });

  it("merges theme, header and footer edits into the current settings", async () => {
    const changeset = staged();
    changeset.working.theme = { colors: { primary: "#0055aa", background: "#ffffff", text: "#111111" }, headingFont: "Inter" };
    changeset.working.header = { ...changeset.working.header, menu: { source: "custom", items: [{ label: "Start", href: "/", children: [] }] } };
    changeset.baseline = structuredClone(changeset.working);
    const menu = structuredClone(changeset.working.header.menu);

    await run(changeset, "update_theme", { patch: { colors: { secondary: "#aa5500" }, radius: 12 } });
    expect(changeset.working.theme).toMatchObject({ colors: { primary: "#0055aa", secondary: "#aa5500", text: "#111111" }, radius: 12, headingFont: "Inter" });
    // The logo is not the agent's to change.
    expect(await run(changeset, "update_theme", { patch: { logoUrl: "https://example.com/logo.png" } }))
      .toEqual({ ok: true, nothingChanged: true, message: expect.stringContaining("Nothing changed"), notes: ["patch.logoUrl is not a setting here and was ignored."] });
    expect(changeset.working.theme).not.toHaveProperty("logoUrl");

    await run(changeset, "update_header", { header: { desktop: { sticky: true } } });
    expect(changeset.working.header.menu).toEqual(menu);
    expect(changeset.working.header.desktop).toMatchObject({ sticky: true, layout: changeset.baseline.header.desktop.layout });

    await run(changeset, "update_footer", { props: { tagline: "Here to help" } });
    expect(changeset.working.footer.tagline).toBe("Here to help");
    expect(sections(changeset.working).at(-1)!.props).toMatchObject({ id: "footer", tagline: "Here to help" });
    await expect(run(changeset, "update_footer", { props: { phone: "555 0100" } })).rejects.toThrow("Business information");
    await expect(run(changeset, "update_footer", {})).rejects.toThrow("props or design");
    expectReplays(changeset);
  });

  it("applies a footer change to the footer section of every page, keeping what differs between them", async () => {
    const changeset = fixtureChangeset();
    const footer = (snapshot: Changeset["working"], id: string) => sections(snapshot, snapshot.pages.findIndex((page) => page.id === id)).at(-1)!;
    // One page words its footer differently, and one has no footer at all.
    footer(changeset.working, fixtureIds.about).props.businessName = "Harbour Plumbing Ltd";
    sections(changeset.working, 3).pop();
    changeset.baseline = structuredClone(changeset.working);

    const result = await run(changeset, "update_footer", {
      props: { tagline: "Here to help", variant: "centered" }, design: { background: { type: "color", color: "#0b2545" } },
    });
    // The answer is short: how many pages, what changed, and the page that has no footer to change.
    expect(result).toEqual({
      ok: true, pages: 3, changed: ["variant", "tagline", "design.background"], pagesWithoutFooter: ["Contact"],
      warnings: [expect.stringContaining("contrast")],
    });
    for (const id of [fixtureIds.home, fixtureIds.about, fixtureIds.pricing]) {
      expect(footer(changeset.working, id).props, id).toMatchObject({
        tagline: "Here to help", variant: "centered", design: { background: { type: "color", color: "#0b2545" } },
      });
    }
    expect(footer(changeset.working, fixtureIds.about).props.businessName).toBe("Harbour Plumbing Ltd");
    expect(sections(changeset.working, 3).some((item) => item.type === "Footer")).toBe(false);
    // One change to review, and pages the agent creates afterwards start from the changed footer.
    expect(changeset.changes).toEqual([expect.objectContaining({ kind: "footer", label: "Update footer on 3 pages" })]);
    await run(changeset, "create_page", { title: "Careers", slug: "careers", navLabel: "Careers", sections: [] });
    expect(sections(changeset.working, 4).at(-1)!.props).toMatchObject({ tagline: "Here to help", variant: "centered" });
    expectReplays(changeset);

    // Applying writes each page's own footer. A footer edited by hand since keeps that edit.
    const current = structuredClone(changeset.baseline);
    footer(current, fixtureIds.pricing).props.tagline = "Edited by hand";
    const meta: ApplyMeta = {
      draftHeader: null, posts: {},
      pages: Object.fromEntries(current.pages.map((page) => [page.id, { draftVersion: "v1", published: false, rawDraft: page.draft_data }])),
    };
    const plan = planAgentApply(current, meta, createAgentReviewPayload(changeset)!.changes, new Set());
    expect(plan.dropped).toEqual([]);
    expect(plan.changes[0]).toMatchObject({ label: "Update footer on 3 pages", items: [`page:${fixtureIds.home}`, `page:${fixtureIds.about}`] });
    expect(plan.notes).toEqual([expect.stringContaining("left out of 1 page")]);
    const written = (id: string) => (plan.items.find((item) => item.key === `page:${id}`) as { draft_data: { content: Section[] } } | undefined)?.draft_data.content.at(-1)!.props;
    expect(written(fixtureIds.about)).toMatchObject({ tagline: "Here to help", businessName: "Harbour Plumbing Ltd" });
    expect(written(fixtureIds.pricing)).toBeUndefined();

    // A footer change also reaches a page created earlier in the run. Undoing that page leaves the rest reviewable and applicable.
    const later = fixtureChangeset();
    await run(later, "create_page", { title: "Careers", slug: "careers", navLabel: "Careers", sections: [] });
    await run(later, "update_footer", { props: { tagline: "Here to help" } });
    const [created] = later.changes;
    const review = createAgentReviewPayload(later)!;
    const kept = previewAgentReview(review, { [created.id]: "undone" });
    expect(kept.error).toBeNull();
    expect((kept.snapshot!.pages as Changeset["working"]["pages"]).map((page) => (page.draft_data as { content: Section[] }).content.at(-1)!.props.tagline))
      .toEqual(Array.from({ length: 4 }, () => "Here to help"));
    const freshMeta: ApplyMeta = {
      ...meta, posts: Object.fromEntries(later.baseline.posts.map((post) => [post.id, { updatedAt: post.updated_at }])),
      pages: Object.fromEntries(later.baseline.pages.map((page) => [page.id, { draftVersion: "v1", published: false, rawDraft: page.draft_data }])),
    };
    const withoutPage = planAgentApply(later.baseline, freshMeta, review.changes, new Set([created.id]));
    expect(withoutPage).toMatchObject({ dropped: [], notes: [] });
    expect(withoutPage.items.map((item) => item.kind)).toEqual(["page", "page", "page", "page"]);

    const none = fixtureChangeset();
    for (const index of [0, 1, 2, 3]) sections(none.working, index).pop();
    await expect(run(none, "update_footer", { props: { tagline: "Nowhere to go" } })).rejects.toThrow("No page on this site has a footer");
  });

  it("carries out the first attempts that used to be refused, and tells the model what it left out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const photos: Context = { ...context, accountId: fixtureIds.account, siteId: fixtureIds.site, choosePhoto: async (query) => ({ url: `/samples/${query}.jpg`, alt: query }) };
    const attempt = async (name: string, input: unknown) => {
      const changeset = fixtureChangeset();
      const result = await makeToolResult(name, input, changeset, photos) as { notes?: string[] };
      expect(changeset.changes, name).toHaveLength(1);
      expectReplays(changeset);
      return { changeset, result, home: sections(changeset.working, 0), footer: sections(changeset.working, 1).at(-1)!.props };
    };

    // Reported: customSection…size: expected one of "24"|"32"|"48"|"64".
    const icons = await attempt("insert_section", { pageId: fixtureIds.home, position: 0, customSection: { background: "soft", width: "contained", rowGap: 32,
      rows: [{ layout: "1-1", gap: 32, columns: [1, 2].map((number) => ({ surface: "none", verticalAlign: "top", gap: 16, elements: [
        { type: "Icon", icon: "clock", size: 48, style: "soft", color: "primary", align: "center" },
        { type: "Heading", text: `Promise ${number}`, level: 3, align: "center" },
        { type: "Divider", lineStyle: "solid", thickness: 1, color: "border", width: 50, align: "center" },
      ] })) }] } });
    expect(JSON.stringify(icons.home[0])).toMatch(/"size":"48".*"level":"h3".*"thickness":"1".*"width":"50"/);
    expect(icons.result.notes).toBeUndefined();

    // Reported: props: expected record, received string.
    const json = await attempt("update_section_props", { pageId: fixtureIds.home, sectionId: "home-hero", props: JSON.stringify({ heading: "Hello", buttonText: "Book a visit" }) });
    expect(json.home[0].props).toMatchObject({ heading: "Hello", buttonText: "Book a visit" });

    // Reported: update_footer: Unrecognized key "textColor". The colour lands in the footer's real colour setting, on every page.
    for (const input of [
      { design: { textColor: "#ffffff", backgroundColor: "#0b2545" } },
      { props: { tagline: "Here to help", textColor: "#ffffff", backgroundColor: "#0b2545" } },
      { tagline: "Here to help", background: "#0b2545", color: "white" },
    ]) {
      const { footer, result } = await attempt("update_footer", input);
      expect(footer.design, JSON.stringify(input)).toMatchObject({ background: { type: "color", color: "#0b2545" }, appearance: { desktop: { textColor: "#ffffff" } } });
      expect(result.notes, JSON.stringify(input)).toBeUndefined();
    }

    // Seen in the evals: a property the block does not have, and an icon outside the curated set.
    const extra = await attempt("update_section_props", { pageId: fixtureIds.home, sectionId: "home-why-0", props: { text: "Why us", size: "xl", level: 3 } });
    expect(extra.result.notes).toEqual(["Unsupported section property: size. It was ignored. Heading has: text, level, font, weight, align."]);
    expect(JSON.stringify(extra.home[2])).toContain('"text":"Why us","level":"h3"');
    const icon = await attempt("insert_section", { pageId: fixtureIds.home, customSection: { rows: [{ columns: [{ elements: [
      { type: "IconList", items: [{ icon: "pound-sterling", text: "Fair prices" }, "No call-out fee"] }] }] }] } });
    expect(icon.result.notes).toEqual([expect.stringContaining('there is no "pound-sterling" icon, so "check" was used')]);

    // Other common first attempts.
    const design = await attempt("update_section_design", { page_id: fixtureIds.home, section_id: "home-hero", padding: "6rem", textAlign: "center", shadow: true });
    expect(design.home[0].props.design).toMatchObject({ shadow: "soft", spacing: { desktop: { paddingTop: 96, paddingLeft: 96 } }, appearance: { desktop: { align: "center" } } });
    const theme = await attempt("update_theme", { colors: { primary: "#0B2545" }, fonts: { heading: "playfair display" }, borderRadius: "12px", logoUrl: "https://example.com/logo.png" });
    expect(theme.changeset.working.theme).toMatchObject({ headingFont: "Playfair Display", radius: 12, colors: { primary: "#0B2545", text: "#17202b" } });
    expect(theme.result.notes).toEqual(["patch.logoUrl is not a setting here and was ignored."]);
    const header = await attempt("update_header", { header: { sticky: "true", desktop: { weight: 600, backgroundColor: "white" }, css: "x" } });
    expect(header.changeset.working.header.desktop).toMatchObject({ sticky: true, weight: "600", color: "#ffffff" });
    expect(header.result.notes).toEqual(["header.css is not a setting here and was ignored."]);
    const page = await attempt("create_page", { title: "Careers at Harbour", sections: [{ designId: "Hero", props: { heading: "Join us", colour: "red" } }] });
    expect(page.changeset.working.pages[4]).toMatchObject({ slug: "careers-at-harbour", nav_label: "Careers at Harbour" });
    expect(page.result.notes).toEqual([expect.stringContaining("Unsupported section property: colour.")]);
    const contact = await attempt("update_footer", { props: { tagline: "Here to help", phone: "555 0100" } });
    expect(contact.footer).toMatchObject({ tagline: "Here to help", phone: "" });
    expect(contact.result.notes).toEqual([expect.stringContaining("phone was left as it is: contact details come from Business information")]);
    const image = await attempt("set_image", { pageId: fixtureIds.home, sectionId: "home-services", field: "services[0].image", query: "pipes" });
    expect((image.home[1].props.services as { image: string }[])[0].image).toBe("/samples/pipes.jpg");
    // Each adjusted call is logged for the agency, by what was left out and never by content.
    expect(warn).toHaveBeenCalledWith("AI agent tool input was adjusted", expect.objectContaining({ tool: "update_theme" }));

    // An edit in which nothing can be applied still fails, and says what the block does have.
    const changeset = fixtureChangeset();
    await expect(run(changeset, "update_section_props", { pageId: fixtureIds.home, sectionId: "home-hero", props: { colour: "red", backgroundImage: "https://example.com/a.jpg" } }))
      .rejects.toThrow(/Nothing in this edit could be applied\. Unsupported section property: colour\..*Hero has: .*set_image/);
    await expect(run(changeset, "set_image", { pageId: fixtureIds.home, sectionId: "home-hero", field: "photo", query: "pipes" })).rejects.toThrow(ToolInputError);
    await expect(run(changeset, "switch_section_design", { pageId: fixtureIds.home, sectionId: "home-hero", designId: "no-such-design" })).rejects.toThrow("unavailable");
    expect(changeset.changes).toHaveLength(0);
    warn.mockRestore();
  });

  it("checks that a pageId and sectionId belong together, and answers a mismatch with the pairs that do", async () => {
    const changeset = fixtureChangeset();
    const choices = async (name: string, input: unknown) => {
      const error = await run(changeset, name, input).catch((cause: unknown) => cause);
      expect(error, name).toBeInstanceOf(ToolInputError);
      return error as ToolInputError;
    };
    // The overview names every section by the page it is on.
    const overview = await run(changeset, "get_site_overview", {}) as { pages: { pageId: string; sections: { sectionId: string }[] }[] };
    expect(overview.pages.map((page) => [page.pageId, page.sections.map((entry) => entry.sectionId)])).toEqual([
      [fixtureIds.home, ["home-hero", "home-services", "home-why-section"]],
      [fixtureIds.about, ["about-text"]],
      [fixtureIds.pricing, ["pricing-plans"]],
      [fixtureIds.contact, ["contact-form"]],
    ]);

    // Right section, wrong page: the answer is the pair that exists.
    const wrongPage = await choices("update_section_props", { pageId: fixtureIds.about, sectionId: "home-hero", props: { heading: "Moved" } });
    expect(wrongPage.message).toContain("is not on pageId");
    expect(wrongPage.choices).toEqual([expect.objectContaining({ pageId: fixtureIds.home, sectionId: "home-hero", title: "Home" })]);
    expect(wrongPage.forModel()).toContain(`"pageId":"${fixtureIds.home}","title":"Home","slug":"","sectionId":"home-hero"`);

    // Unknown section: this page's sections. Unknown page: the site's pages, or the page the section is on.
    const unknown = await choices("delete_section", { pageId: fixtureIds.about, sectionId: "about-txt" });
    expect(unknown.choices).toEqual([expect.objectContaining({ pageId: fixtureIds.about, sectionId: "about-text", type: "TextSection" })]);
    const noPage = "00000000-0000-4000-8000-0000000000ff";
    expect((await choices("get_page", { pageId: noPage })).choices).toHaveLength(4);
    expect((await choices("move_section", { pageId: noPage, sectionId: "pricing-plans", position: 0 })).choices)
      .toEqual([expect.objectContaining({ pageId: fixtureIds.pricing, sectionId: "pricing-plans" })]);
    // A nested element where a whole section is needed: the section that holds it.
    expect((await choices("duplicate_section", { pageId: fixtureIds.home, sectionId: "home-why-0" })).choices)
      .toEqual([{ pageId: fixtureIds.home, sectionId: "home-why-section", type: "Section" }]);

    // The same sectionId on two pages is told apart by its page.
    sections(changeset.working, 1)[0].props.id = "home-hero";
    changeset.baseline = structuredClone(changeset.working);
    await run(changeset, "update_section_props", { pageId: fixtureIds.about, sectionId: "home-hero", props: { heading: "About Harbour" } });
    expect(sections(changeset.working, 1)[0].props.heading).toBe("About Harbour");
    expect(sections(changeset.working, 0)[0].props.heading).toBe("Plumbing done properly");
    expect(changeset.changes).toEqual([expect.objectContaining({ pageId: fixtureIds.about, sectionId: "home-hero" })]);
    expect(changeset.working.pages.filter((page, index) => JSON.stringify(page) !== JSON.stringify(changeset.baseline.pages[index]))).toHaveLength(1);
  });

  it("reads only the sections asked for, and never cuts a long page off in the middle of a section", async () => {
    const changeset = fixtureChangeset();
    const read = async (input: Record<string, unknown>) => await run(changeset, "get_page", { pageId: fixtureIds.home, ...input }) as
      { sections: { sectionId: string }[]; notShown?: { sectionId: string }[] };
    const whole = await read({});
    expect(whole).toMatchObject({ title: "Home", status: "draft" });
    expect(whole.sections.map((entry) => entry.sectionId)).toEqual(["home-hero", "home-services", "home-why-section"]);
    const some = await read({ sectionIds: ["home-services", "home-why-1"] });
    expect(some.sections.map((entry) => entry.sectionId)).toEqual(["home-services", "home-why-1"]);
    expect(JSON.stringify(some).length).toBeLessThan(JSON.stringify(whole).length / 2);
    await expect(read({ sectionIds: ["about-text"] })).rejects.toThrow("is not on pageId");

    sections(changeset.working, 0)[1].props.heading = "x".repeat(30_000);
    const long = await read({});
    expect(long.sections.map((entry) => entry.sectionId)).toEqual(["home-hero"]);
    expect(long.notShown?.map((entry) => entry.sectionId)).toEqual(["home-services", "home-why-section"]);
    expect(() => JSON.parse(JSON.stringify(long))).not.toThrow();
  });

  it("drafts and edits blog posts as text blocks, keeping existing images and published posts untouched", async () => {
    const changeset = staged();
    const image = { type: "image", url: "https://assets.example/site/pipes.jpg", alt: "Frozen pipes", caption: "" };
    const post = (id: string, status: "draft" | "published") => ({
      id, site_id: siteId, title: "Winter tips", subtitle: "", excerpt: "", slug: `winter-${status}`,
      draft_content: { version: 1, blocks: [{ type: "paragraph", html: "<p>Old</p>" }, image] },
      cover_image: "", cover_alt: "", seo_title: "", seo_description: "", status, updated_at: "2026-01-01T00:00:00.000Z",
    });
    const draftId = "00000000-0000-4000-8000-000000000021";
    const liveId = "00000000-0000-4000-8000-000000000022";
    changeset.working.posts = [post(draftId, "draft"), post(liveId, "published")];
    changeset.baseline = structuredClone(changeset.working);

    await run(changeset, "create_blog_post_draft", { title: "Preventing frozen pipes", slug: "preventing-frozen-pipes", blocks: [
      { type: "heading", level: 2, text: "Before the cold arrives" },
      { type: "paragraph", html: "<p>Insulate pipes in <strong>unheated</strong> rooms.<script>alert(1)</script></p>" },
      { type: "list", ordered: false, items: ["Lag the pipes", "Know where your stopcock is"] },
    ] });
    expect(changeset.working.posts[0]).toMatchObject({ title: "Preventing frozen pipes", status: "draft", draft_content: { version: 1 } });
    expect(JSON.stringify(changeset.working.posts[0].draft_content)).not.toContain("script");

    await run(changeset, "update_blog_post_draft", { postId: draftId, excerpt: "Keep the heating on low.", blocks: [
      { type: "paragraph", html: "<p>New intro</p>" }, image,
    ] });
    expect(changeset.working.posts.find((entry) => entry.id === draftId)).toMatchObject({
      title: "Winter tips", excerpt: "Keep the heating on low.", draft_content: { blocks: [{ html: "<p>New intro</p>" }, image] },
    });

    for (const [name, input, message] of [
      ["create_blog_post_draft", { title: "Tiptap", slug: "tiptap", blocks: [{ type: "doc", content: [] }] }, "Invalid"],
      ["create_blog_post_draft", { title: "Again", slug: "preventing-frozen-pipes", blocks: [{ type: "divider" }] }, "already uses that URL"],
      ["create_blog_post_draft", { title: "Photo", slug: "photo", blocks: [{ ...image, url: "https://example.com/new.jpg" }] }, "cannot be added"],
      ["update_blog_post_draft", { postId: draftId, blocks: [{ ...image, url: "https://example.com/new.jpg" }] }, "cannot be added"],
      ["update_blog_post_draft", { postId: draftId, patch: { title: "Old shape" } }, "at least one field"],
      ["update_blog_post_draft", { postId: draftId }, "at least one field"],
      ["update_blog_post_draft", { postId: liveId, title: "Changed live" }, "Only an unpublished draft"],
    ] as const) await expect(run(changeset, name, input), JSON.stringify(input)).rejects.toThrow(message);
    expect(changeset.changes).toHaveLength(2);
  });

  it("never returns embed code to the model, from any tool", async () => {
    for (const [name, input] of [
      ["update_section_props", { pageId, sectionId: "custom", props: { background: "dark" } }],
      ["update_section_props", { pageId, sectionId: "column", props: { surface: "card" } }],
      ["update_section_design", { pageId, sectionId: "custom", design: { shadow: "soft" } }],
      ["duplicate_section", { pageId, sectionId: "custom" }],
      ["move_section", { pageId, sectionId: "custom", position: 0 }],
      ["delete_section", { pageId, sectionId: "custom" }],
    ] as const) {
      const changeset = staged();
      const result = JSON.stringify(await run(changeset, name, input));
      expect(result, name).not.toContain("<secret>");
      // The site itself keeps the code, and so does what the user reviews and applies.
      expect(changeset.changes, name).toHaveLength(1);
      if (name !== "delete_section") expect(JSON.stringify(changeset.working), name).toContain("<secret>");
      expect(JSON.stringify(changeset.baseline), name).toContain("<secret>");
    }
  });

  it("stages nothing for a request that changes nothing", async () => {
    const changeset = staged();
    await run(changeset, "update_section_props", { pageId, sectionId: "hero", props: { heading: "Reliable local plumbers" } });
    for (const [name, input] of [
      ["update_section_props", { pageId, sectionId: "hero", props: { heading: "Reliable local plumbers" } }],
      ["update_theme", { patch: { colors: { background: "#ffffff" } } }],
      ["update_header", { header: {} }],
      ["move_section", { pageId, sectionId: "hero", position: 0 }],
      ["update_page_settings", { pageId, hidden: false }],
    ] as const) {
      // Asking for what is already there is not an error: the model is told, and nothing is added to the review.
      expect(await run(changeset, name, input), name).toEqual({ ok: true, nothingChanged: true, message: "Nothing changed: the site already matches this request." });
    }
    expect(changeset.changes).toHaveLength(1);
    expect(changeset.working.pages).toEqual(expect.arrayContaining([expect.objectContaining({ id: pageId })]));
  });

  it("lets the header reuse the site's images but not bring in outside ones", async () => {
    const changeset = staged();
    const logo = "https://assets.example/site/logo.png";
    changeset.working.header = { ...changeset.working.header, logo: { ...changeset.working.header.logo, mode: "image", image: logo } };
    changeset.baseline = structuredClone(changeset.working);
    for (const header of [
      { logo: { image: "https://tracker.example/pixel.png" } },
      { desktop: { background: "image", image: "https://tracker.example/bg.png" } },
    ]) await expect(run(changeset, "update_header", { header })).rejects.toThrow("media library");
    expect(changeset.changes).toHaveLength(0);
    await run(changeset, "update_header", { header: { desktop: { background: "image", image: logo } } });
    await run(changeset, "update_header", { header: { logo: { mode: "text", image: "" }, mobile: { image: "/samples/tools.jpg" } } });
    expect(changeset.working.header).toMatchObject({ logo: { mode: "text", image: "" }, desktop: { image: logo }, mobile: { image: "/samples/tools.jpg" } });
  });

  it("reads numeric design values written as text, so one of them does not cost the whole edit", async () => {
    const changeset = staged();
    // One refused value fails the whole edit, and a real run's retry then dropped the button style it had asked for.
    await run(changeset, "update_theme", { patch: { radius: "14px", buttonStyle: "pill" } });
    expect(changeset.working.theme).toMatchObject({ radius: 14, buttonStyle: "pill", colors: { background: "#ffffff" } });

    await run(changeset, "update_section_design", { pageId, sectionId: "hero", design: {
      spacing: { desktop: { paddingTop: "96px", paddingBottom: "96" } }, border: { width: "1px", radius: "12" },
      background: { type: "gradient", from: "#0b2545", to: "#13315c", angle: "135" },
    } });
    expect(sections(changeset.working)[0].props.design).toMatchObject({
      spacing: { desktop: { paddingTop: 96, paddingBottom: 96 } }, border: { width: 1, radius: 12 }, background: { angle: 135 },
    });

    await run(changeset, "update_header", { header: { desktop: { height: "80px", fontSize: "15" } } });
    expect(changeset.working.header.desktop).toMatchObject({ height: 80, fontSize: 15 });

    await run(changeset, "insert_section", { pageId, position: "0", customSection: { ...customSection, rowGap: "32px",
      rows: [{ ...customSection.rows[0], gap: "24" }] } });
    expect(sections(changeset.working)[0].props).toMatchObject({ rowGap: 32, rows: [{ props: { gap: 24 } }] });

    for (const [name, input] of [
      ["update_theme", { patch: { radius: "99px" } }],
      ["update_theme", { patch: { radius: "50%" } }],
      ["update_section_design", { pageId, sectionId: "hero", design: { spacing: { desktop: { paddingTop: "20rem" } } } }],
      ["update_section_design", { pageId, sectionId: "hero", design: { spacing: { desktop: { paddingTop: "large" } } } }],
    ] as const) await expect(run(changeset, name, input), JSON.stringify(input)).rejects.toThrow();
    expect(changeset.changes).toHaveLength(4);
  });
});

describe("AI agent context diet", () => {
  const reading = (reads = {}) => {
    const changeset = fixtureChangeset();
    const choosePhoto = async (query: string, alt?: string) => ({ url: `/samples/${query}.jpg`, alt: alt ?? query });
    const tool = (name: string, input: unknown) => makeToolResult(name, input, changeset, { ...context, reads, choosePhoto } as Context);
    return { changeset, tool, reads };
  };

  it("gives the overview as a compact map: pages, menu labels and each section's id, type, design and first words", async () => {
    const changeset = fixtureChangeset();
    changeset.working.pages[1].nav_label = "Our story";
    changeset.working.pages[2].seo = { title: "Plumbing prices", description: "d".repeat(300) };
    const overview = await run(changeset, "get_site_overview", {}) as {
      pages: { pageId: string; title: string; navLabel?: string; seo?: Record<string, string>; sections: Record<string, string>[] }[];
      header: unknown; footer: unknown; business: unknown; theme: unknown;
    };
    const home = overview.pages[0];
    expect(home.sections[0]).toEqual({ sectionId: "home-hero", type: "Hero", designId: expect.any(String), text: expect.stringContaining("Plumbing done properly") });
    for (const section of overview.pages.flatMap((page) => page.sections)) {
      expect(Object.keys(section)).toEqual(["sectionId", "type", "designId", "text"]);
      expect(section.text.split(" ").length).toBeLessThanOrEqual(15);
    }
    // The words are what a visitor reads, not the names of layout options.
    expect(home.sections[2].text).toBe("Why Harbour Plumbing We turn up on time and tidy up after ourselves. About us");
    expect(overview.pages[1]).toMatchObject({ title: "About", navLabel: "Our story" });
    expect(overview.pages[2].seo).toEqual({ title: "Plumbing prices", description: expect.stringMatching(/^d{69}…$/) });
    // No section's properties, and only a summary of the header and footer; the read tools have the rest.
    const text = JSON.stringify(overview);
    expect(text).not.toMatch(/"props"|buttonText|formFields|"design"|fontSize|letterSpacing|socialLinks/);
    expect(overview.header).toEqual({ logo: "Harbour Plumbing", menu: "the site's pages", cta: "Get in touch", desktop: expect.objectContaining({ sticky: expect.any(Boolean) }) });
    expect(overview.footer).toEqual({ businessName: "Harbour Plumbing", tagline: "Local plumbers you can rely on.", variant: expect.any(String) });
    expect(overview.business).toEqual(changeset.working.site.business);
    expect(text.length).toBeLessThan(2_600);
    const { version: _schemaVersion, ...headerSettings } = changeset.working.header;
    void _schemaVersion;
    expect(await run(changeset, "get_site_settings", { part: "header" })).toEqual({ header: headerSettings });
    expect(await run(changeset, "get_site_settings", { part: "footer" })).toEqual({ footer: expect.objectContaining({ tagline: "Local plumbers you can rely on." }) });
  });

  it("reads a page as content and one section in full, and does not send again what was read and has not changed", async () => {
    const { changeset, tool, reads } = reading();
    type PageRead = { sections: { sectionId: string; props: Record<string, unknown>; empty?: string[] }[]; unchanged?: string[] };
    const page = await tool("get_page", { pageId: fixtureIds.home }) as PageRead;
    const hero = page.sections[0];
    // Content: text, links, images and whole lists. Layout options and design are get_section's.
    expect(hero.props).toMatchObject({ heading: "Plumbing done properly", buttonText: "Get a quote", buttonLink: "/contact" });
    expect(hero.props).not.toHaveProperty("design");
    expect(hero.props).not.toHaveProperty("variant");
    expect(hero.props).not.toHaveProperty("id");
    expect(hero.props.formFields).toEqual(sections(changeset.working, 0)[0].props.formFields);
    // What is empty is only named, so the model still knows it can be filled in.
    expect(hero.empty).toEqual(expect.arrayContaining(["backgroundImageAlt", "badgeText"]));
    // Elements nested in a layout keep their ids, which is how they are edited.
    expect(JSON.stringify(page.sections[2])).toContain('"id":"home-why-0"');

    const full = await tool("get_section", { pageId: fixtureIds.home, sectionId: "home-hero" }) as { sectionId: string; props: Record<string, unknown> };
    expect(full).toMatchObject({ sectionId: "home-hero", type: "Hero", props: { variant: expect.any(String), design: expect.any(Object), heading: "Plumbing done properly" } });
    expect(JSON.stringify(hero).length).toBeLessThan(JSON.stringify(full).length * 0.8);

    // Asked again, nothing is resent; the earlier result still stands.
    expect(await tool("get_section", { pageId: fixtureIds.home, sectionId: "home-hero" })).toEqual({ sectionId: "home-hero", unchanged: true, note: expect.stringContaining("earlier") });
    const again = await tool("get_page", { pageId: fixtureIds.home }) as PageRead;
    expect(again).toMatchObject({ sections: [], unchanged: ["home-hero", "home-services", "home-why-section"] });
    expect(JSON.stringify(again).length).toBeLessThan(400);
    // A section that changed since is sent again, and only that one.
    await tool("update_section_props", { pageId: fixtureIds.home, sectionId: "home-hero", props: { heading: "Reliable plumbers" } });
    const after = await tool("get_page", { pageId: fixtureIds.home }) as PageRead;
    expect(after.sections.map((section) => section.sectionId)).toEqual(["home-hero"]);
    expect(after.unchanged).toEqual(["home-services", "home-why-section"]);
    // A read that fails records nothing as read.
    const before = structuredClone(reads);
    await expect(tool("get_page", { pageId: fixtureIds.about, sectionIds: ["about-text", "nope"] })).rejects.toThrow();
    expect(reads).toEqual(before);
    // Without a read log, as outside a run, everything is returned every time.
    const plain = fixtureChangeset();
    await run(plain, "get_page", { pageId: fixtureIds.home });
    expect((await run(plain, "get_page", { pageId: fixtureIds.home }) as PageRead).sections).toHaveLength(3);
  });

  it("answers a change with ok, new ids and what changed, never with the page", async () => {
    const { changeset, tool } = reading();
    const home = { pageId: fixtureIds.home };
    expect(await tool("update_section_props", { ...home, sectionId: "home-hero", props: { heading: "Reliable plumbers", buttonText: "Call us" } }))
      .toEqual({ ok: true, changed: ["heading", "buttonText"] });
    expect(await tool("update_section_design", { ...home, sectionId: "home-hero", design: { shadow: "soft", border: { radius: 12 } } }))
      .toEqual({ ok: true, changed: ["border", "shadow"] });
    expect(await tool("update_theme", { patch: { colors: { primary: "#0b2545" }, radius: 8 } })).toEqual({ ok: true, changed: ["colors.primary", "radius"] });
    expect(await tool("update_page_settings", { ...home, seoTitle: "Plumber in Example City" })).toEqual({ ok: true, changed: ["seo.title"] });
    expect(await tool("move_section", { ...home, sectionId: "home-services", position: 0 })).toEqual({ ok: true, position: 0 });
    expect(await tool("delete_section", { ...home, sectionId: "home-services" })).toEqual({ ok: true });
    expect(await tool("set_image", { ...home, sectionId: "home-hero", field: "backgroundImage", query: "plumber", alt: "A plumber at work" }))
      .toEqual({ ok: true, field: "backgroundImage", alt: "A plumber at work" });

    // A curated design arrives with sample content; only what the call did not supply comes back, to be replaced.
    const faq = aiCatalog.find((design) => design.blockType === "Faq")!;
    const bare = await tool("insert_section", { pageId: fixtureIds.pricing, designId: faq.id }) as { sectionId: string; sampleContent: Record<string, unknown> };
    expect(bare).toMatchObject({ ok: true, type: "Faq", sectionId: expect.any(String), sampleContent: { heading: expect.any(String) } });
    const supplied = Object.fromEntries(Object.entries(bare.sampleContent).filter(([, value]) => typeof value === "string" || Array.isArray(value)));
    const filled = await tool("insert_section", { pageId: fixtureIds.pricing, designId: faq.id, props: supplied }) as { sampleContent?: Record<string, unknown> };
    expect(Object.keys(filled.sampleContent ?? {})).toEqual(Object.keys(bare.sampleContent).filter((key) => !(key in supplied)));
    // A custom layout holds nothing the model did not write, so it is answered with its id and the images to choose.
    const custom = await tool("insert_section", { pageId: fixtureIds.pricing, customSection });
    expect(custom).toEqual({ ok: true, sectionId: expect.any(String), type: "Section", imagesToSet: [expect.objectContaining({ field: "src" })] });
    const created = await tool("create_page", { title: "Careers", slug: "careers", navLabel: "Careers", sections: [{ customSection }] }) as { pageId: string };
    expect(created).toEqual({ ok: true, pageId: expect.any(String), slug: "careers", sections: [{ sectionId: expect.any(String), type: "Section" }], imagesToSet: expect.any(Array) });
    for (const change of changeset.changes) expect(change.patches?.length).toBeGreaterThan(0);
    expectReplays(changeset);
  });

  it("applies ready-made theme presets in one short call, keeping what was not named", async () => {
    const changeset = fixtureChangeset();
    expect(await run(changeset, "apply_theme_preset", { buttons: "pill", corners: "soft", spacing: "spacious" }))
      .toEqual({ ok: true, changed: ["radius", "buttonStyle", "spacing"] });
    expect(changeset.working.theme).toMatchObject({ buttonStyle: "pill", radius: 24, spacing: "spacious", headingFont: "Inter", colors: { primary: "#0b5cab" } });
    await run(changeset, "apply_theme_preset", { palette: "forest-green", fonts: "elegant" });
    expect(changeset.working.theme).toMatchObject({ headingFont: "Playfair Display", bodyFont: "Lato", colors: { primary: "#1d6a43" }, buttonStyle: "pill" });
    expect(changeset.changes.map((change) => change.kind)).toEqual(["theme", "theme"]);
    await expect(run(changeset, "apply_theme_preset", {})).rejects.toThrow();
    await expect(run(changeset, "apply_theme_preset", { palette: "neon" })).rejects.toThrow();
    expect(await run(changeset, "apply_theme_preset", { buttons: "pill" })).toMatchObject({ nothingChanged: true });
    expectReplays(changeset);
  });

  it("returns only the listed, visitor-visible settings from get_site_settings, whatever else is stored", async () => {
    const changeset = fixtureChangeset();
    const { working } = changeset;
    // What a site row and its settings can hold beside what the agent may read.
    working.site.seo = { noindex: true, socialImage: "/share.jpg", googleAnalyticsId: "G-SECRET1234", metaPixelId: "123456789012", googleVerification: "verify-token-abc" };
    Object.assign(working.site, { custom_domain: "secret-domain.example", stripe_customer_id: "cus_secret", owner_email: "owner@private.example" });
    Object.assign(working.footer, { apiKey: "sk-footer-secret", internalNote: "private" });
    Object.assign(working.header, { adminEmail: "staff@private.example" });
    working.blogSettings = {
      timezone: "Europe/London", blog_path: "blog", posts_per_page: 9, index_layout: "grid", default_post_layout: "classic", show_author: true,
      show_date: true, show_reading_time: true, show_share_links: true, show_in_menu: true, noindex_tags: false, cta_text: "Need a plumber?",
      cta_button_text: "Call us", cta_link: "/contact", webhook_secret: "whsec_secret", author_emails: ["writer@private.example"],
    };
    const read = async (part: string) => (await run(changeset, "get_site_settings", { part }) as Record<string, Record<string, unknown>>)[part];

    // The allowed field list, in full. A new setting is unreadable until it is added here on purpose.
    expect(SITE_SETTINGS_FIELDS).toEqual({
      header: ["logo", "menu", "cta", "contactsInMenu", "desktop", "tablet", "mobile"],
      footer: ["businessName", "tagline", "variant", "navigation", "socialLinks", "phone", "email", "address", "hours", "design"],
      seo: ["noindex", "socialImage"],
      blog: ["blog_path", "posts_per_page", "index_layout", "default_post_layout", "show_author", "show_date", "show_reading_time",
        "show_share_links", "show_in_menu", "noindex_tags", "cta_text", "cta_button_text", "cta_link"],
    });
    const parts = { header: await read("header"), footer: await read("footer"), seo: await read("seo"), blog: await read("blog") };
    for (const [part, settings] of Object.entries(parts)) {
      expect(Object.keys(settings).sort(), part).toEqual([...SITE_SETTINGS_FIELDS[part as keyof typeof SITE_SETTINGS_FIELDS]].sort());
    }
    expect(parts.seo).toEqual({ noindex: true, socialImage: "/share.jpg" });
    expect(parts.header.logo).toEqual(working.header.logo);
    await expect(run(changeset, "get_site_settings", { part: "billing" })).rejects.toThrow();
    await expect(run(changeset, "get_site_settings", { part: "site" })).rejects.toThrow();

    // Nothing the agent can read about the site as a whole carries the rest: not the settings, and not the overview.
    const everything = JSON.stringify([parts, await run(changeset, "get_site_overview", {})]);
    for (const secret of ["G-SECRET1234", "123456789012", "verify-token-abc", "secret-domain.example", "cus_secret", "private.example", "sk-footer-secret",
      "whsec_secret", "internalNote", fixtureIds.account]) {
      expect(everything, secret).not.toContain(secret);
    }
  });
});
