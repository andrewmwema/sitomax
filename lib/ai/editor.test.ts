import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({
  supabase: { from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: mocks.lookup };
    return query;
  } },
}) }));
vi.mock("./client", () => ({ requestAi: mocks.request }));
import { runEditorAi } from "./editor";
import { puckConfig } from "@/lib/puck/config";
import { aiCatalog, blockFields } from "./site-schemas";
import type { Field } from "@puckeditor/core";
import { PhotoError } from "@/lib/photos/types";

vi.mock("@/lib/photos", () => ({ createPhotoLibrary: () => ({
  search: async () => { throw new PhotoError("Photo search is not configured."); },
}) }));

const pageId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const accountId = "00000000-0000-4000-8000-000000000003";
const message = (name: string, input: unknown) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", name, input }] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PIXABAY_API_KEY", "");
  mocks.lookup.mockResolvedValue({ data: { id: pageId, site: { id: siteId, account_id: accountId, business: { businessName: "Example Co" } } }, error: null });
});

describe("editor AI", () => {
  it("edits FAQ copy with the metered client while preserving design and images and sanitizing rich text", async () => {
    mocks.request.mockImplementation(async (request) => {
      const payload = JSON.parse(request.messages[0].content);
      expect(payload.business.businessName).toBe("Example Co");
      expect(JSON.stringify(payload.section)).not.toContain("/samples/");
      const props = payload.section.item0.props;
      props.items.push({ question: "Water heater?", answer: '<p onclick="bad()">Ask us<script>bad()</script></p>' });
      return message("edit_section", { items: { item0: props } });
    });
    const original = { type: "Faq", props: { ...structuredClone(puckConfig.components.Faq.defaultProps), id: "faq" } };
    const result = await runEditorAi({ kind: "section", pageId, section: original, instruction: "Add a question", large: true });
    expect(result.kind).toBe("section");
    if (result.kind !== "section") throw new Error("Wrong result");
    expect(result.section.props.contactImage).toBe(original.props.contactImage);
    expect(result.section.props.design).toEqual(original.props.design);
    expect(JSON.stringify(result.section.props.items)).not.toMatch(/script|onclick|bad\(\)/);
    expect((result.section.props.items as unknown[])).toHaveLength(3);
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ action: "edit_section", largeRewrite: true, accountId, siteId }));
    expect(original.props.items).toHaveLength(2);
  });

  it("updates nested layout text without sending or changing embed code", async () => {
    mocks.request.mockImplementation(async (request) => {
      const payload = JSON.parse(request.messages[0].content);
      expect(JSON.stringify(payload)).not.toContain("private-embed-code");
      return message("edit_section", { items: { item0: { text: "Revised" } } });
    });
    const section = { type: "Section", props: { id: "section", rows: [{ type: "Row", props: { id: "row", columns: [
      { type: "Column", props: { id: "column", content: [
        { type: "Heading", props: { id: "heading", text: "Original", level: "h2" } },
        { type: "Embed", props: { id: "embed", code: "private-embed-code" } },
      ] } },
    ] } }] } };
    const result = await runEditorAi({ kind: "section", pageId, section, instruction: "Rewrite", large: false });
    expect(JSON.stringify(result)).toContain("Revised");
    expect(JSON.stringify(result)).toContain("private-embed-code");
    expect(JSON.stringify(section)).toContain("Original");
  });

  it("retries invalid tool output once through the metered entry point", async () => {
    mocks.request.mockResolvedValueOnce(message("rewrite_text", { text: 17 }))
      .mockResolvedValueOnce(message("rewrite_text", { text: "Improved copy" }));
    await expect(runEditorAi({ kind: "text", pageId, text: "Original", instruction: "Rewrite" }))
      .resolves.toEqual({ kind: "text", text: "Improved copy" });
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls[1][0].messages[0].content).toContain("validation errors");
    expect(mocks.request.mock.calls[0][0]).toMatchObject({ action: "rewrite_text", accountId, siteId });
  });

  it("adds only a validated catalog design with placeholder images", async () => {
    const design = aiCatalog.find((entry) => entry.blockType === "Faq")!;
    const value = (field: Field): unknown => {
      if (field.type === "select" || field.type === "radio") return field.options[0].value;
      if (field.type === "array") return [];
      if (field.type === "object") return Object.fromEntries(Object.entries(field.objectFields).map(([key, child]) => [key, value(child)]));
      if (field.type === "number") return 1;
      return "";
    };
    const props = Object.fromEntries(Object.entries(blockFields("Faq")).filter(([key]) => key !== "design").map(([key, field]) => [key, value(field)]));
    props.variant = design.props.variant ?? props.variant;
    props.contactImage = "water heater";
    mocks.request.mockResolvedValue(message("add_section", { section: { blockType: "Faq", designId: design.id, props } }));
    const result = await runEditorAi({ kind: "add", pageId, instruction: "Add FAQs" });
    expect(result.kind).toBe("add");
    if (result.kind !== "add") throw new Error("Wrong result");
    expect(result.section.type).toBe("Faq");
    expect(result.section.props.contactImage).toBe("");
    expect(result.warnings.join(" ")).toContain("placeholders");
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ action: "edit_section", largeRewrite: true }));
  });

  it("adds a custom section using bounded responsive layout primitives", async () => {
    const section = {
      background: "soft", width: "contained", rowGap: 48, design: { shadow: "soft" },
      rows: [{ layout: "1", gap: 32, reverseOnMobile: false, columns: [{
        surface: "none", verticalAlign: "top", gap: 16,
        elements: [{ type: "Heading", text: "Our approach", level: "h2", align: "left" }],
      }] }],
    };
    mocks.lookup.mockResolvedValue({ data: { id: pageId, site: { id: siteId, account_id: accountId,
      business: { businessName: "Example Co" }, theme: { colors: { primary: "#123456", secondary: "#aabbcc", background: "#ffffff", text: "#111111" } },
      draft_theme: null } }, error: null });
    mocks.request.mockResolvedValue(message("add_custom_section", { section }));
    const result = await runEditorAi({ kind: "add", pageId, instruction: "Create a custom split section", mode: "custom" });
    expect(result.kind).toBe("add");
    if (result.kind !== "add") throw new Error("Wrong result");
    expect(result.section.type).toBe("Section");
    expect(result.section.props.id).toMatch(/^Section-/);
    expect(result.section.props.rows).toMatchObject([{ type: "Row", props: { columns: [{ type: "Column", props: {
      content: [{ type: "Heading", props: { text: "Our approach" } }],
    } }] } }]);
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      action: "edit_section", tools: [expect.objectContaining({ name: "add_custom_section", strict: false })],
    }));
  });

  it("does not call AI for inaccessible pages", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    await expect(runEditorAi({ kind: "text", pageId, text: "Copy", instruction: "Rewrite" })).rejects.toThrow("unavailable");
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
