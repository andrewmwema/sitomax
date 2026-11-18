import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Field } from "@puckeditor/core";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), lookup: vi.fn(), request: vi.fn(), begin: vi.fn(), finish: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({
  user: { id: "authenticated-user" },
  supabase: { rpc: mocks.rpc, from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: mocks.lookup };
    return query;
  } },
}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("./client", () => ({ requestAi: mocks.request }));
vi.mock("./usage", () => ({ beginSiteGeneration: mocks.begin, finishSiteGeneration: mocks.finish }));
import { buildGeneratedSite, safeDefaultSection } from "./generate-site";
import { aiCatalog, blockFields, blockSchemas, PAGE_SLUGS, pageFillContract, PLAN_SITE_TOOL, planSchema, type SitePlan } from "./site-schemas";
import { SITE_SYSTEM_PROMPT } from "./site-prompt";
import { brand } from "@/lib/brand";
import { strictTool } from "./strict-tool";

const accountId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const pageId = "00000000-0000-4000-8000-000000000003";
const generationId = "00000000-0000-4000-8000-000000000004";
const input = { accountId, siteId, businessName: "Local Plumbing", businessType: "Plumber", city: "Nairobi",
  services: ["Repairs"], difference: "", style: "modern", primaryColor: "", secondaryColor: "",
  phone: "", email: "", address: "", description: "", confirmReplace: true };
const hero = aiCatalog.find((design) => design.blockType === "TextSection")!;
const footer = aiCatalog.find((design) => design.blockType === "Footer")!;
const seo = { title: "Local Plumbing Nairobi", description: "Plumbing repairs in Nairobi. Contact Local Plumbing to discuss your needs." };
const plan = {
  style: "modern", colors: { primary: "#123456", secondary: "#aabbcc", background: "#ffffff", text: "#111111" },
  fonts: { heading: "Inter", body: "Inter" },
  pages: PAGE_SLUGS.map((slug) => ({ slug, title: slug || "Home", sections: [
    { blockType: hero.blockType, designId: hero.id }, { blockType: footer.blockType, designId: footer.id },
  ] })),
  seo: { home: seo, about: seo, services: seo, contact: seo },
};

function fieldValue(field: Field): unknown {
  if (field.type === "select" || field.type === "radio") return field.options[0].value;
  if (field.type === "array") return [];
  if (field.type === "object") return Object.fromEntries(Object.entries(field.objectFields).map(([key, child]) => [key, fieldValue(child)]));
  if (field.type === "number") return 1;
  if (field.type === "richtext") return '<p onclick="bad()">Business copy<script>bad()</script></p>';
  return "";
}
function section(designId: string) {
  const design = aiCatalog.find((entry) => entry.id === designId)!;
  return Object.fromEntries(Object.entries(blockFields(design.blockType)).filter(([key]) => key !== "design" && key !== "variant")
    .map(([key, field]) => [key, fieldValue(field)]));
}
const message = (name: string, value: unknown) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", name, input: value }] });
function answer(request: { toolName: string; messages: { content: string }[] }) {
  if (request.toolName === "plan_site") return message("plan_site", structuredClone(plan));
  const page = JSON.parse(request.messages[0].content.split("\n")[1]) as {
    slug: string; sections: Record<string, { designId: string }>;
  };
  return message("fill_page", { slug: page.slug, sections: Object.fromEntries(
    Object.entries(page.sections).map(([key, entry]) => [key, section(entry.designId)]),
  ) });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "local-test-not-a-key"); vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_super_admin" ? false : name === "is_account_owner" ? true : pageId, error: null }));
  mocks.lookup.mockResolvedValue({ data: { id: siteId }, error: null });
  mocks.begin.mockResolvedValue(generationId); mocks.finish.mockResolvedValue(undefined);
  mocks.request.mockImplementation(answer);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("catalog site generation", () => {
  it("uses one strict tool per call with a shared cached prompt, sanitizes and saves only drafts", async () => {
    const progress: string[] = [];
    const result = await buildGeneratedSite(input, ({ message }) => progress.push(message));
    expect(result).toMatchObject({ siteId, pageId });
    expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(accountId, siteId);
    expect(mocks.request).toHaveBeenCalledTimes(5);
    for (const [request] of mocks.request.mock.calls) expect(request).toMatchObject({
      generationId, action: "generate_site", tools: [{ name: request.toolName, strict: true }], cacheTtl: "5m", system: SITE_SYSTEM_PROMPT,
    });
    expect(mocks.request.mock.calls.map(([request]) => request.toolName)).toEqual(["plan_site", ...Array(4).fill("fill_page")]);
    const save = mocks.rpc.mock.calls.find(([name]) => name === "replace_ai_site_drafts_with_business")![1];
    expect(save.p_pages).toHaveLength(4);
    expect(JSON.stringify(save.p_pages)).not.toMatch(/onclick|<script>|bad\(\)/);
    expect(save).not.toHaveProperty("published_data");
    expect(save.p_pages[0].data.content[0].props.businessName).toBe("Local Plumbing");
    expect(save.p_business).toMatchObject({ businessName: "Local Plumbing", businessType: "Plumber", city: "Nairobi", services: ["Repairs"] });
    expect(progress).toEqual(["Planning your site…", "Writing Home…", "Writing About…", "Writing Services…",
      "Writing Contact…", "Finding photos…", "Saving unpublished drafts…"]);
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(generationId, true, siteId);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("repairs a plan once with the Zod errors, never accepting unknown catalog IDs or long SEO", async () => {
    const invalid = structuredClone(plan);
    invalid.pages[0].sections[0].designId = "invented-design";
    invalid.seo.home.title = "x".repeat(60);
    mocks.request.mockImplementationOnce(() => message("plan_site", invalid));
    await buildGeneratedSite(input);
    expect(mocks.request).toHaveBeenCalledTimes(6);
    expect(mocks.request.mock.calls[1][0].messages[0].content).toContain("validation errors");
    expect(mocks.request.mock.calls[1][0].messages[0].content).toContain("seo.home.title");
    expect(planSchema.safeParse(invalid).success).toBe(false);
    const mismatch = structuredClone(plan);
    mismatch.pages[0].sections[0].blockType = footer.blockType;
    expect(planSchema.safeParse(mismatch).success).toBe(false);
  });
  it("waits for the previous page before starting the next and stops after a provider failure", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    mocks.request.mockImplementation(async (request) => {
      if (request.toolName === "plan_site") return answer(request);
      if (request.messages[0].content.includes('"slug":"about"')) throw new Error("Page failed");
      await barrier; return answer(request);
    });
    const pending = buildGeneratedSite(input);
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(mocks.finish).not.toHaveBeenCalled();
    release();
    await expect(pending).rejects.toThrow("Generation stopped");
    expect(mocks.request).toHaveBeenCalledTimes(3);
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(generationId, false);
  });
  it("repairs excess sections without throwing outside validation, and ignores unplanned content", async () => {
    mocks.request.mockImplementation((request) => {
      const response = answer(request);
      if (request.toolName === "fill_page") {
        const page = response.content[0].input as { sections: Record<string, unknown> };
        page.sections.unplanned = { code: "<script>bad()</script>" };
      }
      return response;
    });
    await buildGeneratedSite(input);
    expect(mocks.request).toHaveBeenCalledTimes(9);
    const saved = mocks.rpc.mock.calls.find(([name]) => name === "replace_ai_site_drafts_with_business")![1].p_pages;
    expect(JSON.stringify(saved)).not.toContain("<script>");
    expect(saved[0].data.content).toHaveLength(3);
  });
  it("falls back only the failing section after one repair, discloses it and removes unverifiable sample copy", async () => {
    mocks.request.mockImplementation((request) => {
      if (request.toolName === "plan_site") return answer(request);
      const { slug, sections } = JSON.parse(request.messages[0].content.split("\n")[1]);
      return message("fill_page", { slug, sections: Object.fromEntries(Object.entries(sections)
        .map(([key, entry]) => [key, { ...section((entry as { designId: string }).designId),
          ...(slug === "about" && key === "section_1" ? { heading: 123 } : {}) }])) });
    });
    const result = await buildGeneratedSite(input);
    expect(mocks.request).toHaveBeenCalledTimes(6);
    expect(result.warnings.some((warning) => warning.includes("validation failed twice"))).toBe(true);
    const saved = mocks.rpc.mock.calls.find(([name]) => name === "replace_ai_site_drafts_with_business")![1].p_pages;
    expect(saved.find((page: { slug: string }) => page.slug === "about").data.content[1].props.heading).toMatch(/\[Add /);
    const fallback = safeDefaultSection("hero-centered-badge");
    expect(fallback.props.badgeText).toMatch(/^\[Add /);
  });
  it("denies editors and unconfirmed replacement before any quota or provider work", async () => {
    await expect(buildGeneratedSite({ ...input, confirmReplace: false })).rejects.toThrow();
    await expect(buildGeneratedSite({ ...input, siteId: undefined, subdomain: "new-site" })).rejects.toThrow("Only account owners");
    await expect(buildGeneratedSite({
      ...input, siteId: undefined, subdomain: brand.marketingSiteSubdomain,
    })).rejects.toThrow("Only account owners");
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(buildGeneratedSite(input)).rejects.toThrow("Only account owners");
    expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("creates agency-built sites as unpublished drafts and links the one generation charge to the saved site", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_super_admin", error: null }));
    mocks.lookup.mockResolvedValueOnce({ data: { id: accountId, is_internal: false }, error: null })
      .mockResolvedValue({ data: null, error: null });
    const create = vi.fn().mockResolvedValue({ data: [{ site_id: siteId, page_id: pageId }], error: null });
    mocks.admin.mockReturnValue({ rpc: create });
    await expect(buildGeneratedSite({ ...input, siteId: undefined, subdomain: "local-plumbing" })).resolves.toMatchObject({ siteId, pageId });
    expect(create).toHaveBeenCalledWith("create_ai_site_with_business", expect.objectContaining({ p_account_id: accountId, p_subdomain: "local-plumbing" }));
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(generationId, true, siteId);
    for (const [request] of mocks.request.mock.calls) expect(request.messages[0].content).not.toContain(accountId);
  });
  it("reserves the marketing hostname for internal accounts before charging or generating", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_super_admin", error: null }));
    mocks.lookup.mockResolvedValue({ data: { id: accountId, is_internal: false }, error: null });
    const marketing = { ...input, siteId: undefined, subdomain: brand.marketingSiteSubdomain };
    await expect(buildGeneratedSite(marketing)).rejects.toThrow("reserved");
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();

    mocks.lookup.mockResolvedValueOnce({ data: { id: accountId, is_internal: true }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const create = vi.fn().mockResolvedValue({ data: [{ site_id: siteId, page_id: pageId }], error: null });
    mocks.admin.mockReturnValue({ rpc: create });
    await expect(buildGeneratedSite(marketing)).resolves.toMatchObject({ siteId, pageId });
    expect(create).toHaveBeenCalledWith("create_ai_site_with_business", expect.objectContaining({ p_subdomain: brand.marketingSiteSubdomain }));
  });
  it("stops after two invalid plans without saving; finalizes already-billed work without free retries", async () => {
    mocks.request.mockResolvedValue(message("plan_site", { style: "invented" }));
    await expect(buildGeneratedSite(input)).rejects.toThrow("invalid twice");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls.some(([name]) => name === "replace_ai_site_drafts_with_business")).toBe(false);
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(generationId, false);
  });
  it("builds strict content contracts directly from all catalog block fields", () => {
    for (const type of Object.keys(blockSchemas)) {
      const schema = z.toJSONSchema(blockSchemas[type]);
      expect(schema.additionalProperties).toBe(false);
      expect(Object.keys(schema.properties ?? {})).toEqual(Object.keys(blockFields(type)).filter((key) => key !== "design"));
    }
    const schema = z.strictObject({ items: z.array(z.string()).length(4) });
    const { input_schema } = strictTool("test_tool", "Test schema", schema);
    expect(input_schema).toMatchObject({
      type: "object", additionalProperties: false,
      properties: { items: { type: "array", description: expect.stringContaining("minItems: 4") } },
    });
    expect(input_schema).not.toHaveProperty("properties.items.maxItems");
    expect(schema.safeParse({ items: ["one"] }).success).toBe(false);
  });
  it("keeps all four maximum-size page grammars below 16 KiB and free of unions", () => {
    const bytes = (schema: object) => Buffer.byteLength(JSON.stringify(schema));
    expect(bytes(PLAN_SITE_TOOL.input_schema)).toBeLessThan(8 * 1024);
    for (const style of ["classic", "modern"] as const) {
      const designs = [...new Map(aiCatalog.filter((design) => design.styles.includes(style))
        .map((design) => [design.blockType, design])).values()];
      const sections = designs.map(({ blockType, id: designId }) => ({ blockType, designId }))
        .map((section) => ({ section, size: bytes(pageFillContract({
          slug: "", title: "Home", sections: [section],
        }).tool.input_schema) }))
        .sort((a, b) => b.size - a.size).slice(0, 7).map(({ section }) => section);
      expect(sections).toHaveLength(7);
      const largest = planSchema.parse({ ...plan, style, pages: PAGE_SLUGS.map((slug) =>
        ({ slug, title: slug || "Home", sections })) }) satisfies SitePlan;
      for (const page of largest.pages) {
        const { tool, slots } = pageFillContract(page);
        const json = JSON.stringify(tool.input_schema);
        expect(bytes(tool.input_schema)).toBeLessThan(16 * 1024);
        expect(json).not.toMatch(/"(anyOf|oneOf|prefixItems|blockType|designId|variant)":/);
        expect(slots.map(({ blockType }) => blockType)).toEqual(sections.map(({ blockType }) => blockType));
      }
    }
  });
  it("uses compact enums and booleans, preserves variants, and allows an omitted image", () => {
    const design = aiCatalog.find(({ id }) => id === "hero-centered-badge")!;
    const { slots: [slot], tool } = pageFillContract({ slug: "", title: "Home",
      sections: [{ blockType: design.blockType, designId: design.id }] });
    const json = JSON.stringify(tool.input_schema);
    expect(json).toContain('"type":"boolean"');
    expect(z.toJSONSchema(blockSchemas.Hero).properties?.variant).toMatchObject({ enum: expect.arrayContaining([design.props.variant]) });
    expect(slot.imageField).toBeTruthy();
    const props = section(design.id);
    delete props[slot.imageField!];
    expect(slot.schema.safeParse(props).success).toBe(true);
    expect(slot.schema.safeParse({ ...props, variant: "unplanned" }).success).toBe(false);
  });
});
