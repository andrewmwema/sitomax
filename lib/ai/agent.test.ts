import { describe, expect, it } from "vitest";
import { defaultHeader } from "@/lib/header";
import { puckConfig } from "@/lib/puck/config";
import { contrastRatio } from "@/lib/theme/presets";
import { makeToolResult } from "./agent";
import { createAgentReviewPayload, previewAgentReview } from "./agent-review";
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

  it("reads custom layouts and searches the site without exposing embed code", async () => {
    const changeset = staged();
    const page = await run(changeset, "get_page", { pageId }) as { sections: Section[] };
    expect(page.sections.map((item) => item.props.id)).toEqual(["hero", "custom"]);
    const text = JSON.stringify(page);
    expect(text).toContain("Original");
    expect(text).not.toContain("<secret>");
    expect(JSON.stringify(await run(changeset, "search_site", { query: "secret" }))).not.toContain("<secret>");
    expect(JSON.stringify(await run(changeset, "get_site_overview", {}))).not.toContain("<secret>");
    expect(JSON.stringify(changeset.working)).toContain("<secret>");
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
    const services = await run(changeset, "insert_section", { pageId, designId: aiCatalog.find((entry) => entry.blockType === "Services")!.id }) as { after: Section };
    await makeToolResult("set_image", { pageId, sectionId: services.after.props.id, field: "services.0.image", query: "pipes" }, changeset, photos);
    expect((sections(changeset.working).at(-2)!.props.services as Record<string, unknown>[])[0]).toMatchObject({ image: "https://assets.example/pipes.jpg" });
    await expect(makeToolResult("set_image", { pageId, sectionId: "heading", field: "text", query: "pipes" }, changeset, photos)).rejects.toThrow("supported image field");

    expect(nested(changeset.working, "heading").props).toMatchObject({ text: "Trusted since [year]", level: "h3", design: { shadow: "soft" } });
    expect(nested(changeset.working, "image").props).toMatchObject({ src: "https://assets.example/plumber.jpg", alt: "A plumber at work" });
    expect(nested(changeset.baseline, "heading").props.text).toBe("Original");
    expect(changeset.changes).toHaveLength(5);
    expectReplays(changeset);
    // Pickers the AI schemas cannot express stay out of reach.
    await expect(run(changeset, "update_section_props", { pageId, sectionId: "heading", props: { color: "#ff0000" } })).rejects.toThrow("Unsupported section property");
    await expect(run(changeset, "update_section_props", { pageId, sectionId: "heading", props: { design: {} } })).rejects.toThrow("update_section_design");
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
    for (const props of [{ variant: "nope" }, { services: [{ title: "Missing fields" }] }, { nope: true }]) {
      await expect(run(changeset, "insert_section", { pageId, designId: services.id, props })).rejects.toThrow();
    }
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
      { ...customSection, rows: [{ ...customSection.rows[0], layout: "1" }] },
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
      { title: "Both", slug: "both", navLabel: "Both", sections: [{ designId: hero.id, customSection }] },
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
    await expect(run(changeset, "update_theme", { patch: { logoUrl: "https://example.com/logo.png" } })).rejects.toThrow();

    await run(changeset, "update_header", { header: { desktop: { sticky: true } } });
    expect(changeset.working.header.menu).toEqual(menu);
    expect(changeset.working.header.desktop).toMatchObject({ sticky: true, layout: changeset.baseline.header.desktop.layout });

    await run(changeset, "update_footer", { props: { tagline: "Here to help" } });
    expect(changeset.working.footer.tagline).toBe("Here to help");
    await expect(run(changeset, "update_footer", { props: { phone: "555 0100" } })).rejects.toThrow("Business information");
    expectReplays(changeset);
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
      ["update_blog_post_draft", { postId: draftId, patch: { title: "Old shape" } }, "Unrecognized"],
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
    ] as const) await expect(run(changeset, name, input), name).rejects.toThrow("Nothing changed");
    expect(changeset.changes).toHaveLength(1);
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
});
