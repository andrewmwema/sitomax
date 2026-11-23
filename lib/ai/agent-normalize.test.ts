import { describe, expect, it } from "vitest";
import { customSectionSchema } from "./custom-layout";
import { designPatchSchema } from "./edit-design";
import { normalizeColor, normalizeCustomSection, normalizeDesignPatch, normalizeThemePatch, normalizeToolInput } from "./agent-normalize";
import { agentToolParameters, agentToolSchemas, themePatchSchema } from "./agent-tools";
import { parseLenient } from "./lenient-input";

const pageId = "00000000-0000-4000-8000-000000000010";
const tool = (name: string, input: unknown, notes: string[] = []) =>
  parseLenient(agentToolSchemas.get(name)!, normalizeToolInput(name, input, agentToolParameters.get(name)!, notes), { notes });
const design = (raw: unknown) => parseLenient(designPatchSchema, normalizeDesignPatch(raw));

describe("AI agent input normalisation", () => {
  it("puts design settings written the CSS way where the design schema keeps them", () => {
    // The reported failure: textColor at the top of a design.
    expect(design({ textColor: "#ffffff" })).toEqual({ appearance: { desktop: { textColor: "#ffffff" } } });
    expect(design({ backgroundColor: "#0B2545", color: "white", textAlign: "center", borderRadius: "12px" })).toEqual({
      background: { type: "color", color: "#0B2545" }, appearance: { desktop: { textColor: "#ffffff", align: "center", borderRadius: 12 } },
    });
    expect(design({ background: "#f3f4f6", padding: "6rem", marginTop: 16, shadow: true })).toEqual({
      background: { type: "color", color: "#f3f4f6" }, shadow: "soft",
      spacing: { desktop: { paddingTop: 96, paddingRight: 96, paddingBottom: 96, paddingLeft: 96, marginTop: 16 } },
    });
    // Settings without a device are for all screens; a device already named is left alone.
    expect(design({ spacing: { paddingY: 64, mobile: { paddingTop: 24 } }, appearance: { color: "rgb(255, 255, 255)" } })).toEqual({
      spacing: { desktop: { paddingTop: 64, paddingBottom: 64 }, mobile: { paddingTop: 24 } }, appearance: { desktop: { textColor: "#ffffff" } },
    });
    expect(design({ background: { from: "#0b2545", to: "#13315c" } })).toEqual({ background: { type: "gradient", from: "#0b2545", to: "#13315c", angle: 135 } });
    expect(design({ background: "none", fullBleed: false, textColor: "light" })).toEqual({
      background: { type: "none" }, settings: { fullBleed: false }, appearance: { desktop: { textColor: "#ffffff" } },
    });
    expect(design('{"shadow":"lg"}')).toEqual({ shadow: "strong" });
    // What has no place in a design is noted, not guessed at.
    const notes: string[] = [];
    expect(parseLenient(designPatchSchema, normalizeDesignPatch({ shadow: "soft", fontSize: 20, textColor: "auto" }), { notes, label: "design" })).toEqual({ shadow: "soft" });
    expect(notes.sort()).toEqual(["design.fontSize is not a setting here and was ignored.", "design.textColor is not a setting here and was ignored."]);
    expect(design({ backgroundColor: "transparent" })).toEqual({ background: { type: "none" } });
    for (const raw of [{ shadow: "constructor" }, { backgroundColor: "constructor" }, { textColor: "toString" }]) expect(() => design(raw)).toThrow(/Invalid/);
    expect(normalizeColor("#FFFFFFCC")).toBe("#ffffff");
    expect(normalizeColor("green")).toBe("green");
  });

  it("reads the usual other names for theme settings", () => {
    const theme = (raw: unknown) => parseLenient(themePatchSchema, normalizeThemePatch(raw));
    expect(theme({ fonts: { heading: "playfair display", body: "Inter" }, primaryColor: "0b2545", background: "white", borderRadius: "12px", buttonShape: "Pill" })).toEqual({
      headingFont: "Playfair Display", bodyFont: "Inter", radius: 12, buttonStyle: "pill", colors: { primary: "#0b2545", background: "#ffffff" },
    });
    expect(theme({ theme: { colors: { primary: "#0b2545" } } })).toEqual({ colors: { primary: "#0b2545" } });
    expect(() => theme({ headingFont: "Comic Sans" })).toThrow();
  });

  it("completes a custom section written loosely into the full compact format", () => {
    const section = parseLenient(customSectionSchema, normalizeCustomSection({
      background: "#f3f4f6", gap: 30,
      rows: [{ layout: "1/1/1", columns: [
        // The reported failure: sizes written as numbers for options that are strings.
        { content: [{ type: "Icon", name: "clock", size: 48 }, { type: "heading", text: "<strong>On time</strong>", level: 3 }, { type: "Divider", thickness: 2, width: 50 }] },
        { elements: [{ type: "IconList", items: ["Tidy", { icon: "heart-handshake", label: "Honest" }], gap: 11 }, { type: "paragraph", content: "<p>We tidy up.</p><p>Every <b>time</b>.</p>" }] },
        { surface: "card", elements: [{ type: "Button", text: "Call us", link: "/contact" }, { type: "spacer", height: 44 }, { type: "Image", src: "https://example.com/a.jpg", alt: "A van", aspect: "16:9", width: 100 }] },
      ] }],
    }));
    expect(section).toMatchObject({ background: "default", width: "contained", rowGap: 32, design: { background: { type: "color", color: "#f3f4f6" } } });
    const [row] = section.rows;
    expect(row).toMatchObject({ layout: "1-1-1", gap: 32, reverseOnMobile: false });
    expect(row.columns.map((column) => [column.surface, column.verticalAlign, column.gap])).toEqual([["none", "top", 16], ["none", "top", 16], ["card", "top", 16]]);
    expect(row.columns[0].elements).toEqual([
      { type: "Icon", icon: "clock", size: "48", style: "plain", color: "primary", align: "left" },
      { type: "Heading", text: "On time", level: "h3", align: "left" },
      { type: "Divider", lineStyle: "solid", thickness: "2", color: "border", width: "50", align: "left" },
    ]);
    expect(row.columns[1].elements).toEqual([
      { type: "IconList", items: [{ icon: "check", text: "Tidy" }, { icon: "heart-handshake", text: "Honest" }], iconColor: "primary", size: "base", gap: 12 },
      { type: "Text", text: "We tidy up.\n\nEvery **time**.", align: "left" },
    ]);
    expect(row.columns[2].elements).toEqual([
      { type: "Button", label: "Call us", href: "/contact", variant: "primary", size: "md", align: "left" },
      { type: "VerticalSpace", height: 48, mobileHeight: 48 },
      { type: "Image", query: "A van", alt: "A van", aspect: "16/9", fit: "cover", radius: "theme", width: "100", align: "left" },
    ]);
    // A layout that does not match its columns becomes the even split; elements alone become one column.
    expect(customSectionSchema.parse(normalizeCustomSection({ rows: [{ layout: "1", columns: [{ elements: [{ type: "Text", text: "a" }] }, { elements: [{ type: "Text", text: "b" }] }] }] })).rows[0].layout).toBe("1-1");
    expect(customSectionSchema.parse(normalizeCustomSection('{"elements":[{"type":"Heading","text":"Hello"}]}')).rows[0]).toMatchObject({ layout: "1", columns: [{ elements: [{ type: "Heading", level: "h2" }] }] });
    // Nothing unsafe gets in this way.
    expect(() => customSectionSchema.parse(normalizeCustomSection({ rows: [{ columns: [{ elements: [{ type: "Embed", code: "<script></script>" }] }] }] }))).toThrow();
  });

  it("reads a tool's parameters under other names, and moves settings sent beside the payload into it", () => {
    expect(tool("update_section_props", { page_id: pageId, section_id: "hero", props: '{"heading":"Hello"}' })).toEqual({ pageId, sectionId: "hero", props: { heading: "Hello" } });
    expect(tool("update_section_props", { pageId, id: "hero", heading: "Hello" })).toEqual({ pageId, sectionId: "hero", props: { heading: "Hello" } });
    expect(tool("update_section_design", { page: pageId, section: "hero", shadow: "soft" })).toEqual({ pageId, sectionId: "hero", design: { shadow: "soft" } });
    expect(tool("update_theme", { colors: { primary: "#0b2545" } })).toEqual({ patch: { colors: { primary: "#0b2545" } } });
    expect(tool("update_header", { desktop: { sticky: true } })).toEqual({ header: { desktop: { sticky: true } } });
    expect(tool("update_footer", { tagline: "Hello", design: { shadow: "soft" } })).toEqual({ props: { tagline: "Hello" }, design: { shadow: "soft" } });
    expect(tool("get_page", { id: pageId, sectionIds: "hero" })).toEqual({ pageId, sectionIds: ["hero"] });
    expect(tool("move_section", { pageId, sectionId: "hero", index: "0" })).toEqual({ pageId, sectionId: "hero", position: 0 });
    expect(tool("insert_section", { pageId, blockType: "Faq", heading: "Questions" })).toEqual({ pageId, designId: "Faq", props: { heading: "Questions" } });
    expect(tool("insert_section", { pageId, rows: [{ columns: [{ elements: [{ type: "Text", text: "Hi" }] }] }] })).toMatchObject({ pageId, customSection: { rows: [{ layout: "1" }] } });
    expect(tool("plan", { steps: "1. Rewrite the hero\n2. Add an FAQ" })).toEqual({ steps: ["Rewrite the hero", "Add an FAQ"] });
    expect(tool("report_progress", { steps: { step: "1", status: "done" } })).toEqual({ steps: [{ step: 1, status: "done" }] });

    // A page's address and menu label follow from its title; a parameter no tool has is noted.
    const notes: string[] = [];
    expect(tool("create_page", { title: "Careers at Harbour Plumbing", sections: [{ design: "hero-split" }, "faq-accordion"], colour: "red" }, notes)).toEqual({
      title: "Careers at Harbour Plumbing", slug: "careers-at-harbour-plumbing", navLabel: "Careers at Harbour",
      sections: [{ designId: "hero-split" }, { designId: "faq-accordion" }],
    });
    expect(notes).toEqual(["colour is not a parameter of create_page and was ignored."]);
    // A long title still gives an address the page rules accept.
    expect(tool("create_page", { title: "Emergency boiler repair and central heating installation in Example City", sections: [] }))
      .toMatchObject({ slug: "emergency-boiler-repair-and-central-heating-installation-in" });
    expect(tool("create_blog_post_draft", { title: "Frozen pipes", slug: "frozen-pipes", content: ["Lag your pipes.", { type: "Heading", title: "Before winter", level: "h2" },
      { type: "list", items: [{ text: "Find the stopcock" }] }, { type: "quote", quote: "Saved us a fortune." }] })).toMatchObject({ blocks: [
      { type: "paragraph", html: "<p>Lag your pipes.</p>" }, { type: "heading", text: "Before winter", level: 2 },
      { type: "list", ordered: false, items: ["Find the stopcock"] }, { type: "quote", text: "Saved us a fortune.", attribution: "" },
    ] });
  });
});
