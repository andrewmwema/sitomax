import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(), pages: vi.fn(), save: vi.fn(), request: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: { from: mocks.from } }) }));
vi.mock("./client", () => ({ requestAi: mocks.request }));
vi.mock("./photos", () => ({
  prepareSectionPhotoSuggestions: vi.fn(),
}));

import { generateEmptyPage, saveEmptyPage } from "./empty-page";

const pageId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const accountId = "00000000-0000-4000-8000-000000000003";
const draft = { root: { props: { title: "About our team", description: "Keep my SEO." } }, content: [] };
const section = (text: string) => ({
  background: "default", width: "contained", rowGap: 48, design: {},
  rows: [{ layout: "1", gap: 32, reverseOnMobile: false, columns: [{
    surface: "none", verticalAlign: "top", gap: 16,
    elements: [{ type: "Heading", text, level: "h1", align: "left" },
      { type: "Text", text: "Our team helps you understand the available services and decide what to do next. Tell us about your needs and we can discuss the work together, answer your questions and explain the next steps.", align: "left" },
      { type: "Button", label: "Explore home", href: "/", variant: "primary", size: "md", align: "left" }],
  }] }],
});

beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: vi.fn(() => query), eq: mocks.eq, maybeSingle: mocks.lookup,
    order: mocks.pages, update: mocks.update };
  mocks.from.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.update.mockImplementation(() => ({ eq: mocks.eq }));
  query.select.mockImplementation(() => mocks.update.mock.calls.length
    ? mocks.save() : query);
  mocks.save.mockResolvedValue({ data: [{ id: pageId }], error: null });
  mocks.lookup.mockResolvedValue({ data: {
    id: pageId, slug: "our-team", title: "About our team", draft_data: draft,
    site: { id: siteId, account_id: accountId, business: { businessName: "Example", city: "York" },
      theme: { colors: { primary: "#123456" } }, draft_theme: null },
  }, error: null });
  mocks.pages.mockResolvedValue({ data: [
    { id: pageId, slug: "our-team", nav_label: "Team", title: "About our team", draft_data: draft },
    { id: siteId, slug: "", title: "Home", draft_data: { content: [
      { type: "Navigation", props: { id: "shared-nav", variant: "dark", brandLink: "/", links: [] } },
      { type: "Footer", props: { id: "shared-footer", variant: "centered", businessName: "Example" } },
    ] } },
  ], error: null });
  mocks.request.mockResolvedValue({ stop_reason: "tool_use", content: [{
    type: "tool_use", name: "build_empty_page", id: "call", input: { sections: [section("Our team"), section("Our approach")] },
  }] });
});

describe("building an empty page", () => {
  it("preserves shared legacy Navigation until the header migration is installed", async () => {
    mocks.lookup.mockResolvedValueOnce({ data: null, error: { code: "42703", message: "column sites.draft_header does not exist" } });
    const result = await generateEmptyPage(pageId);
    expect(result.data.content[0]).toMatchObject({ type: "Navigation", props: { variant: "dark" } });
  });
  it("uses RLS-loaded business, theme and actual page links while sharing chrome and preserving root settings", async () => {
    const result = await generateEmptyPage(pageId);
    const request = mocks.request.mock.calls[0][0];
    expect(request).toMatchObject({ accountId, siteId, action: "edit_section", largeRewrite: true });
    expect(request.messages[0].content).toContain('"businessName":"Example"');
    expect(request.messages[0].content).toContain('"primary":"#123456"');
    expect(request.messages[0].content).toContain('"label":"Team","href":"/our-team"');
    expect(result.data.content.some(item => item.type === "Navigation")).toBe(false);
    expect(result.data.content.at(-1)).toMatchObject({ type: "Footer", props: { variant: "centered" } });
    expect(result.data.content.at(-1)?.props.id).not.toBe("shared-footer");
    expect(result.data.root).toEqual(draft.root);
    expect(result.expectedDraft).toEqual(draft);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith("site_id", siteId);
  });

  it("does not call AI for an inaccessible or nonempty page, including legacy zone content", async () => {
    mocks.lookup.mockResolvedValueOnce({ data: null, error: null });
    await expect(generateEmptyPage(pageId)).rejects.toThrow("unavailable");
    const original = await mocks.lookup();
    mocks.lookup.mockResolvedValue({ ...original, data: { ...original.data, draft_data: {
      ...draft, zones: { "section:content": [{ type: "Text", props: { id: "text", text: "Existing" } }] },
    } } });
    await expect(generateEmptyPage(pageId)).rejects.toThrow("Only empty pages");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects generated links to pages that do not exist after the bounded repair attempt", async () => {
    const bad = section("Our team");
    mocks.request.mockResolvedValue({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: "build_empty_page", id: "call", input: { sections: [{
        ...bad, rows: [{ ...bad.rows[0], columns: [{
          ...bad.rows[0].columns[0],
          elements: [{ type: "Button", label: "Missing", href: "/not-a-page", variant: "primary", size: "md", align: "left" }],
        }] }],
      }, section("Our approach")] },
    }] });
    await expect(generateEmptyPage(pageId)).rejects.toThrow("failed validation");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("repairs heading-only pages instead of returning them as complete", async () => {
    const empty = section("Only a title");
    empty.rows[0].columns[0].elements = [empty.rows[0].columns[0].elements[0]];
    mocks.request.mockResolvedValue({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: "build_empty_page", id: "call", input: { sections: [empty, empty] },
    }] });
    await expect(generateEmptyPage(pageId)).rejects.toThrow("failed validation");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.request.mock.calls[1][0].messages)).toContain("substantive supporting copy");
  });
});

describe("saving an AI page", () => {
  const data = { root: { props: { title: "Team", __editorTheme: { colors: { primary: "#ffffff" } } } },
    content: [{ type: "Section", props: { id: "generated", rows: [] } }] };

  it("atomically compares the full empty snapshot and updates only draft content via the RLS client", async () => {
    await expect(saveEmptyPage(pageId, data, draft, pageId)).resolves.toMatchObject({ status: "success" });
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ draft_data: {
      ...data, root: { props: { title: "Team" } },
    } });
    expect(mocks.eq).toHaveBeenCalledWith("id", pageId);
    expect(mocks.eq).toHaveBeenCalledWith("draft_data", JSON.stringify(draft));
    expect(mocks.from).toHaveBeenCalledWith("pages");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("fails safely when another editor saved, access was revoked, or the database rejected the write", async () => {
    mocks.save.mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(saveEmptyPage(pageId, data, draft, pageId)).resolves.toMatchObject({ status: "error", conflict: true });
    await expect(saveEmptyPage(pageId, data, draft, pageId)).resolves.toMatchObject({ status: "error" });
  });

  it("rejects a nonempty comparison snapshot and nested embeds without touching the database", async () => {
    await expect(saveEmptyPage(pageId, data, { ...draft, content: [{ type: "Hero" }] }, pageId)).rejects.toThrow("Only empty");
    await expect(saveEmptyPage(pageId, {
      ...data, content: [{ type: "Section", props: { id: "section", rows: [
        { type: "Embed", props: { id: "embed", code: "<script>bad()</script>" } },
      ] } }],
    }, draft, pageId)).rejects.toThrow("embeds");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
