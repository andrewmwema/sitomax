import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Field } from "@puckeditor/core";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), lookup: vi.fn(), existing: vi.fn(), request: vi.fn(), begin: vi.fn(),
  finish: vi.fn(), claim: vi.fn(), finishRetry: vi.fn(), admin: vi.fn(), photoLibrary: vi.fn(),
  start: vi.fn(), checkpoint: vi.fn(), complete: vi.fn() }));
vi.mock("@/lib/photos", () => ({ createPhotoLibrary: mocks.photoLibrary }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({
  user: { id: "authenticated-user" },
  supabase: { rpc: mocks.rpc, from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: mocks.lookup, order: mocks.existing };
    return query;
  } },
}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("./client", () => ({ requestAi: mocks.request }));
vi.mock("./usage", () => ({ beginSiteGeneration: mocks.begin, finishSiteGeneration: mocks.finish,
  startDraftCheckpoints: mocks.start, checkpointDraft: mocks.checkpoint, completeDraftCheckpoints: mocks.complete,
  claimPageRetry: mocks.claim, finishPageRetry: mocks.finishRetry }));
import { buildGeneratedSite, retryGeneratedPage } from "./generate-site";
import { aiCatalog, blockFields, blockSchemas, PAGE_SLUGS, pageFillContract, PLAN_SITE_TOOL, planSchema, type SitePlan } from "./site-schemas";
import { SITE_SYSTEM_PROMPT } from "./site-prompt";
import { brand } from "@/lib/brand";
import { strictTool } from "./strict-tool";
import { customSystemPrompt } from "./custom-layout";
import type { GenerationInput } from "./site-input";
import { createGenerationInputSchema, extraPageCredits, slugFromPageName } from "./site-input";
import { emptyBusiness } from "@/lib/business";

const accountId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const pageId = "00000000-0000-4000-8000-000000000003";
const generationId = "00000000-0000-4000-8000-000000000004";
const retryId = "00000000-0000-4000-8000-000000000007";
const business = { ...emptyBusiness, businessName: "Local Plumbing", businessType: "Plumber", city: "Nairobi", services: ["Repairs"] };
const input = { accountId, siteId, businessName: "Local Plumbing", businessType: "Plumber", city: "Nairobi",
  services: ["Repairs"], difference: "", style: "modern", primaryColor: "", secondaryColor: "",
  phone: "", email: "", address: "", description: "", confirmReplace: true, confirmBusinessUpdate: true, expectedBusiness: business };
const hero = aiCatalog.find((design) => design.blockType === "Hero" && design.styles.includes("modern"))!;
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
  if (field.type === "custom" && "aiKind" in field && field.aiKind === "icon") return "wrench";
  if (field.type === "select" || field.type === "radio") return field.options[0].value;
  if (field.type === "array") return [];
  if (field.type === "object") return Object.fromEntries(Object.entries(field.objectFields).map(([key, child]) => [key, fieldValue(child)]));
  if (field.type === "number") return 1;
  if (field.type === "richtext") return `<p onclick="bad()">${bodyCopy}<script>bad()</script></p>`;
  return "";
}
function section(designId: string) {
  const design = aiCatalog.find((entry) => entry.id === designId)!;
  return Object.fromEntries(Object.entries(blockFields(design.blockType)).filter(([key]) => key !== "design" && key !== "variant")
    .map(([key, field]) => [key, key === "heading" ? "Local Plumbing" : key === "buttonText" ? "Contact us"
      : key === "buttonLink" ? "/" : fieldValue(field)]));
}
const bodyCopy = "We help you explore plumbing repairs in Nairobi and understand the next steps for your home. Tell us about the work you need so we can discuss your requirements and help you decide how to proceed.";
const message = (name: string, value: unknown) => ({ stop_reason: "tool_use", content: [
  { type: "tool_use", id: "toolu_test", name, input: value },
] });
function rowsFor(pages: { slug: string }[]) {
  return pages.map(({ slug }, index) => ({
    slug, pageId: index ? `00000000-0000-4000-8001-${String(index).padStart(12, "0")}` : pageId,
    built: false, retryId: index === 1 ? retryId : `00000000-0000-4000-8002-${String(index).padStart(12, "0")}`,
  }));
}
function savedPayload() {
  const options = mocks.start.mock.calls[0][3];
  const rows = rowsFor(options.pages);
  return { p_generation_id: generationId, p_pages: options.pages.map((page: { slug: string }, index: number) => ({
    ...page, data: mocks.checkpoint.mock.calls.find((args) => args[2] === rows[index].retryId)?.[3] ?? null,
  })) };
}
function answer(request: { toolName: string; messages: { content: string }[] }) {
  if (request.toolName === "plan_site") return message("plan_site", structuredClone(plan));
  const page = JSON.parse(request.messages[0].content.split("\n")[1]) as {
    slug: string; sections: Record<string, { designId: string }>;
  };
  return message("fill_page", { slug: page.slug, sections: Object.fromEntries(
    Object.entries(page.sections).map(([key, entry]) => {
      const props = section(entry.designId);
      if ("buttonLink" in props) props.buttonLink = `/${page.slug}`;
      return [key, props];
    }),
  ) });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "local-test-not-a-key"); vi.stubEnv("PIXABAY_API_KEY", "");
  mocks.rpc.mockImplementation(async (name: string) =>
    ({ data: name === "is_super_admin" ? false : name === "is_account_owner" ? true : null, error: null }));
  mocks.existing.mockResolvedValue({ data: [], error: null });
  mocks.lookup.mockResolvedValue({ data: { id: siteId, business }, error: null });
  mocks.begin.mockResolvedValue(generationId); mocks.finish.mockResolvedValue(undefined);
  mocks.start.mockImplementation(async (_account, _site, _generation, options) => rowsFor(options.pages));
  mocks.checkpoint.mockResolvedValue(true); mocks.complete.mockResolvedValue(undefined);
  mocks.request.mockImplementation(answer);
  mocks.photoLibrary.mockReturnValue({ search: vi.fn().mockResolvedValue([]) });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("catalog site generation", () => {
  it("rejects unknown AI icon names instead of silently rendering the fallback star", () => {
    const design = aiCatalog.find((entry) => entry.blockType === "TextSection")!;
    const props = section(design.id);
    expect(blockSchemas.TextSection.safeParse({ ...props, variant: "standard", calloutIcon: "wrench" }).success).toBe(true);
    expect(blockSchemas.TextSection.safeParse({ ...props, variant: "standard", calloutIcon: "plumbing-tool-made-up" }).success).toBe(false);
  });
  it("drops extra proposals and fills a missing custom page in user-selected order", async () => {
    mocks.request.mockResolvedValueOnce(message("plan_site", { ...plan, pages: [
      { ...plan.pages[0], slug: "pricing" }, { slug: "unexpected", sections: [{ designId: "not-a-design" }] },
    ] }));
    const result = await buildGeneratedSite({ ...input, desiredPages: ["service-areas", "pricing"],
      pageDetails: [{ slug: "service-areas", name: "Service areas", purpose: "Cities we serve" }], desiredSections: ["pricing"] });
    expect(result.pages).toMatchObject([{ slug: "service-areas", built: true }, { slug: "pricing", built: true }]);
    const requests = mocks.request.mock.calls.slice(1).map(([request]) => JSON.parse(request.messages[0].content.split("\n")[1]));
    expect(requests[0]).toMatchObject({ slug: "service-areas", title: "Service areas" });
    expect(mocks.request.mock.calls[1][0].messages[0].content).toContain('PAGE PURPOSE: "Cities we serve"');
    expect(Object.values(requests[1].sections)).toContainEqual(expect.objectContaining({ blockType: "Pricing" }));
    expect(Object.values(requests[0].sections)).not.toContainEqual(expect.objectContaining({ blockType: "Pricing" }));
  });

  it("validates custom addresses and charges only for pages beyond six", () => {
    const schema = createGenerationInputSchema();
    const slug = slugFromPageName("Café Service Areas");
    const detail = { slug, name: "Café Service Areas", purpose: "Cities we serve" };
    expect(slug).toBe("cafe-service-areas");
    expect(schema.safeParse({ ...input, desiredPages: [slug], pageDetails: [detail] }).success).toBe(true);
    expect(schema.safeParse({ ...input, desiredPages: [slug, slug], pageDetails: [detail] }).success).toBe(false);
    expect(schema.safeParse({ ...input, desiredPages: ["dashboard"] }).success).toBe(false);
    expect(schema.safeParse({ ...input, siteId: undefined, subdomain: "local-plumbing", desiredPages: [slug] }).success).toBe(false);
    expect([6, 7, 10].map(extraPageCredits)).toEqual([0, 2, 8]);
  });
  it("uses a strict plan and non-strict fills with a shared cached prompt, sanitizes and saves only drafts", async () => {
    const progress: string[] = [];
    const result = await buildGeneratedSite(input, ({ message }) => progress.push(message));
    expect(result).toMatchObject({ siteId, pageId });
    expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(accountId, siteId, 4);
    expect(mocks.request).toHaveBeenCalledTimes(5);
    for (const [request] of mocks.request.mock.calls) expect(request).toMatchObject({
      generationId, action: "generate_site", tools: [{ name: request.toolName, strict: request.toolName === "plan_site" }],
      cacheTtl: "5m", system: SITE_SYSTEM_PROMPT,
    });
    expect(mocks.request.mock.calls.map(([request]) => request.toolName)).toEqual(["plan_site", ...Array(4).fill("fill_page")]);
    const save = savedPayload();
    expect(save.p_pages).toHaveLength(4);
    expect(JSON.stringify(save.p_pages)).not.toMatch(/onclick|<script>|bad\(\)/);
    expect(save).not.toHaveProperty("published_data");
    expect(save.p_pages[0].data.content[0].props.businessName).toBe("Local Plumbing");
    expect(save).not.toHaveProperty("p_theme");
    expect(progress).toEqual(["Planning your site…", "Preparing recoverable page drafts…", "Writing Home…", "Saved Home draft ✓", "Writing About…", "Saved About draft ✓",
      "Writing Services…", "Saved Services draft ✓", "Writing Contact…", "Saved Contact draft ✓", "Unpublished drafts saved."]);
    expect(save.p_generation_id).toBe(generationId);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(accountId, generationId);
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
  it("waits for the previous page before starting the next and preserves successful pages after a failure", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    mocks.request.mockImplementation(async (request) => {
      if (request.toolName === "plan_site") return answer(request);
      if (JSON.parse(request.messages[0].content.split("\n")[1]).slug === "about") {
        expect(mocks.checkpoint).toHaveBeenCalledTimes(1);
        expect(mocks.complete).not.toHaveBeenCalled();
        throw new Error("Page failed");
      }
      await barrier; return answer(request);
    });
    const pending = buildGeneratedSite(input);
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start.mock.calls[0][3].pages.every((page: { data: unknown; retrySpec: unknown }) => page.data === null && page.retrySpec)).toBe(true);
    expect(mocks.finish).not.toHaveBeenCalled();
    release();
    await expect(pending).resolves.toMatchObject({ pages: [
      { slug: "", built: true }, { slug: "about", built: false, retryId }, { slug: "services", built: true }, { slug: "contact", built: true },
    ] });
    expect(mocks.request).toHaveBeenCalledTimes(6);
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.checkpoint).toHaveBeenCalledTimes(3);
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(accountId, generationId);
  });
  it("does not mark heading-only pages as built, and supplies acceptance feedback on the bounded retry", async () => {
    mocks.request.mockImplementation((request) => {
      const response = answer(request);
      if (request.toolName === "fill_page") {
        const page = response.content[0].input as { sections: Record<string, Record<string, unknown>> };
        Object.values(page.sections).forEach((props) => {
          for (const key of ["subheading", "text", "buttonText", "secondaryButtonText"]) if (key in props) props[key] = "";
        });
      }
      return response;
    });
    const result = await buildGeneratedSite({ ...input, desiredPages: [""] });
    expect(result.pages).toMatchObject([{ built: false, retryId: expect.any(String) }]);
    expect(mocks.request).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(mocks.request.mock.calls[2][0].messages)).toContain("substantive supporting copy");
    expect(mocks.checkpoint).not.toHaveBeenCalled();
  });
  it("preserves concurrent draft edits and does not advertise an unavailable retry", async () => {
    mocks.checkpoint.mockResolvedValue(false);
    const result = await buildGeneratedSite({ ...input, desiredPages: [""] });
    expect(result.pages).toMatchObject([{ built: false, pageId }]);
    expect(result.pages[0].retryId).toBeUndefined();
    expect(result.warnings).toContain("Home: the draft changed during generation; no content was overwritten.");
  });
  it("stops on a checkpoint failure without discarding already saved drafts", async () => {
    mocks.checkpoint.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(buildGeneratedSite(input)).rejects.toThrow("Check your drafts");
    expect(mocks.request).toHaveBeenCalledTimes(3);
    expect(mocks.checkpoint).toHaveBeenCalledTimes(2);
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(accountId, generationId);
  });
  it("shares the Home draft footer across rebuilt pages and retry specifications", async () => {
    mocks.existing.mockResolvedValue({ data: [{ id: pageId, slug: "", nav_label: "Home",
      draft_data: { content: [{ type: "Footer", props: { id: "original-footer", variant: "compact", tagline: "Saved introduction" } }] } }], error: null });
    await buildGeneratedSite({ ...input, desiredPages: ["about", "services"] });
    const saved = savedPayload().p_pages;
    expect(saved).toHaveLength(2);
    for (const page of saved) {
      expect(page.retrySpec.footer.props).toMatchObject({ variant: "compact", tagline: "Saved introduction" });
      expect(page.data.content.at(-1)).toMatchObject({ type: "Footer", props: { variant: "compact", tagline: "Saved introduction" } });
    }
    expect(saved[0].data.content.at(-1).props.id).not.toBe(saved[1].data.content.at(-1).props.id);
  });
  it("requires explicit current Business confirmation before charging and preserves saved social profiles", async () => {
    await expect(buildGeneratedSite({ ...input, phone: "+1 555 0100", confirmBusinessUpdate: false })).rejects.toThrow("Confirm the site-wide");
    await expect(buildGeneratedSite({ ...input, phone: "+1 555 0100", expectedBusiness: { ...business, city: "Stale" } })).rejects.toThrow("Business information changed");
    expect(mocks.begin).not.toHaveBeenCalled();
    const saved = { ...business, socialLinks: [{ label: "Photos", url: "https://instagram.com/example" }] };
    mocks.lookup.mockResolvedValue({ data: { id: siteId, business: saved }, error: null });
    await buildGeneratedSite({ ...input, phone: "+1 555 0100", expectedBusiness: saved, desiredPages: [""] });
    expect(mocks.start.mock.calls[0][3]).toMatchObject({
      business: { phone: "+1 555 0100", socialLinks: saved.socialLinks }, expectedBusiness: saved,
    });
  });
  it("explains a concurrent Business change detected while the plan was being written", async () => {
    mocks.start.mockRejectedValue(new Error("Business information changed. Reload and confirm the latest details before building."));
    await expect(buildGeneratedSite(input)).rejects.toThrow("Business information changed. Reload");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.checkpoint).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(generationId, false);
  });
  it("repairs invalid props once in the same conversation and saves only corrected content", async () => {
    let originalTurn: object[] = [];
    mocks.request.mockImplementation((request) => {
      const response = answer(request);
      if (request.toolName !== "fill_page" || JSON.parse(request.messages[0].content.split("\n")[1]).slug !== "about") return response;
      if (request.messages.length === 1) {
        const page = response.content[0].input as { sections: { section_1: Record<string, unknown> } };
        page.sections.section_1.heading = 123;
        originalTurn = [{ type: "thinking", thinking: "private reasoning", signature: "signed" }, ...response.content];
        return { ...response, content: originalTurn };
      }
      expect(request.messages).toEqual([
        { role: "user", content: expect.stringContaining('"slug":"about"') },
        { role: "assistant", content: originalTurn },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_test", is_error: true,
          content: expect.stringMatching(/sections\.section_1\.heading: .+[\s\S]+Call fill_page exactly once/) }] },
      ]);
      return response;
    });
    await buildGeneratedSite(input);
    expect(mocks.request).toHaveBeenCalledTimes(6);
    expect(mocks.finish).not.toHaveBeenCalled();
    for (const repairAttempt of [false, true]) {
      expect(console.info).toHaveBeenCalledWith("AI site tool call", {
        tool: "fill_page", strict: false, schemaBytes: expect.any(Number), stop_reason: "tool_use",
        repairAttempt, repairNeeded: !repairAttempt,
      });
    }
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toMatch(/private reasoning|Local Plumbing/);
  });
  it("automatically retries a failed page, then allows a free retry without regenerating the others", async () => {
    mocks.request.mockImplementation((request) => {
      if (request.toolName === "plan_site") return answer(request);
      const { slug, sections } = JSON.parse(request.messages[0].content.split("\n")[1]);
      return message("fill_page", { slug, sections: Object.fromEntries(Object.entries(sections)
        .map(([key, entry]) => [key, { ...section((entry as { designId: string }).designId),
          ...(slug === "about" && key === "section_1" ? { heading: 123 } : {}) }])) });
    });
    const progress: string[] = [];
    const result = await buildGeneratedSite(input, ({ message }) => progress.push(message));
    expect(result.pages[1]).toMatchObject({ slug: "about", built: false, retryId });
    expect(mocks.request).toHaveBeenCalledTimes(8);
    expect(progress).toContain("Retrying About…");
    const retryPageId = result.pages[1].pageId;
    const save = savedPayload();
    expect(save.p_pages[1]).toMatchObject({ slug: "about", data: null, retrySpec: expect.any(Object) });
    mocks.claim.mockResolvedValue({ accountId, siteId, pageId: retryPageId, leaseId: retryId, slug: "about", spec: save.p_pages[1].retrySpec });
    mocks.finishRetry.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(retryGeneratedPage(retryId, vi.fn(), retryId)).resolves.toMatchObject({ retryId, built: false });
    mocks.request.mockImplementation(answer);
    await expect(retryGeneratedPage(retryId, vi.fn(), retryId)).resolves.toMatchObject({ slug: "about", built: true });
    expect(mocks.begin).toHaveBeenCalledTimes(1);
    expect(mocks.finishRetry).toHaveBeenLastCalledWith(retryId, retryId, expect.objectContaining({ content: expect.any(Array) }));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
  it("asks for the expected tool again without inventing a tool ID for a text-only reply", async () => {
    mocks.request.mockImplementationOnce(answer).mockResolvedValueOnce({
      stop_reason: "end_turn", content: [{ type: "text", text: "No tool used." }],
    });
    await expect(buildGeneratedSite(input)).resolves.toMatchObject({ siteId, pageId });
    expect(mocks.request.mock.calls[2][0].messages).toEqual([
      { role: "user", content: expect.stringContaining('"slug":""') },
      { role: "assistant", content: [{ type: "text", text: "No tool used." }] },
      { role: "user", content: expect.stringContaining("Call fill_page exactly once") },
    ]);
  });
  it("denies editors and unconfirmed replacement before any quota or provider work", async () => {
    mocks.existing.mockResolvedValueOnce({ data: [{ slug: "", draft_data: { content: [{ type: "Hero" }] } }], error: null });
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
    const futureSiteId = "00000000-0000-4000-8000-000000000005";
    const random = vi.spyOn(crypto, "randomUUID").mockReturnValue(futureSiteId);
    const photoHero = aiCatalog.find((design) => design.blockType === "Hero" && design.styles.includes("modern"))!;
    const photoPlan = structuredClone(plan);
    photoPlan.pages[0].sections[0] = { blockType: photoHero.blockType, designId: photoHero.id };
    mocks.request.mockImplementation((request) => {
      if (request.toolName === "plan_site") return message("plan_site", photoPlan);
      const response = answer(request);
      if (JSON.parse(request.messages[0].content.split("\n")[1]).slug === "") {
        (response.content[0].input as { sections: { section_1: Record<string, unknown> } }).sections.section_1.backgroundImage = "plumbing tools";
      }
      return response;
    });
    const selectPhoto = vi.fn().mockImplementation(async ({ siteId: id }) => ({
      url: `https://storage.example/site-assets/${id}/pixabay-42.jpg`, alt: "Stock photograph: tools",
    }));
    mocks.photoLibrary.mockReturnValue({ search: vi.fn().mockResolvedValue([{ id: 42 }]), select: selectPhoto });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_super_admin", error: null }));
    mocks.lookup.mockResolvedValueOnce({ data: { id: accountId, is_internal: false }, error: null })
      .mockResolvedValue({ data: null, error: null });
    await expect(buildGeneratedSite({ ...input, siteId: undefined, subdomain: "local-plumbing" })).resolves.toMatchObject({ siteId: futureSiteId, pageId });
    expect(mocks.start).toHaveBeenCalledWith(accountId, futureSiteId, generationId, expect.objectContaining({
      subdomain: "local-plumbing", business: expect.objectContaining({ businessName: input.businessName }),
    }));
    expect(mocks.photoLibrary).toHaveBeenCalledWith(expect.anything(), accountId);
    expect(selectPhoto).toHaveBeenCalledExactlyOnceWith({
      siteId: futureSiteId, query: "plumbing tools", orientation: "horizontal", photoId: 42,
    });
    expect(savedPayload().p_pages[0].data).toMatchObject({ content: expect.arrayContaining([expect.objectContaining({ props: expect.objectContaining({
      backgroundImage: `https://storage.example/site-assets/${futureSiteId}/pixabay-42.jpg`, photoCredits: [],
    }) })]) });
    expect(mocks.finish).not.toHaveBeenCalled();
    for (const [request] of mocks.request.mock.calls) expect(request.messages[0].content).not.toContain(accountId);
    random.mockRestore();
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
    await expect(buildGeneratedSite(marketing)).resolves.toMatchObject({ pageId });
    expect(mocks.start.mock.calls[0][3]).toMatchObject({ subdomain: brand.marketingSiteSubdomain });
  });
  it("stops after two invalid plans without saving; finalizes already-billed work without free retries", async () => {
    mocks.request.mockResolvedValue(message("plan_site", { style: "invented" }));
    await expect(buildGeneratedSite(input)).rejects.toThrow("invalid twice");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.start).not.toHaveBeenCalled();
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

describe("custom site generation", () => {
  function customPlan(desiredPages: GenerationInput["desiredPages"], extras: GenerationInput["desiredSections"] = []) {
    return {
      style: "modern", colors: { primary: "#123456", secondary: "#aabbcc", background: "#ffffff", text: "#111111" },
      fonts: { heading: "Lora", body: "Inter" },
      pages: Object.fromEntries(desiredPages.map((slug) => [slug || "home", { title: slug || "Home", seo, sections: [
        { kind: slug === "contact" ? "contact" : "hero", goal: "Welcome visitors" },
        ...(slug === "" ? extras.map((kind) => ({ kind, goal: `Explain ${kind} with supplied facts` })) : []),
        { kind: "footer", goal: "Contact details" },
      ] }])),
    };
  }
  const generatedSection = (heading: string) => ({
      background: "default", width: "contained", rowGap: 48, design: {},
      rows: [{ layout: "1", gap: 32, reverseOnMobile: false, columns: [{
        surface: "none", verticalAlign: "top", gap: 16,
        elements: [{ type: "Heading", text: heading, level: "h2", align: "left" },
          { type: "Text", text: bodyCopy, align: "left" },
          { type: "Button", label: "Contact us", href: "/", variant: "primary", size: "md", align: "left" }],
      }] }],
  });
  const requestId = "00000000-0000-4000-8000-000000000005";

  it.each([
    { type: "Plumber", pages: [""] as GenerationInput["desiredPages"], extras: [] as GenerationInput["desiredSections"] },
    { type: "SaaS", pages: [...PAGE_SLUGS], extras: ["pricing", "faq", "gallery"] as GenerationInput["desiredSections"] },
  ])("assembles editable draft data for $type with pages $pages", async ({ type, pages: desiredPages, extras }) => {
    const layoutPlan = customPlan(desiredPages, extras);
    mocks.request.mockImplementation((request) => {
      if (request.toolName === "plan_custom_site") return message("plan_custom_site", layoutPlan);
      const { current } = JSON.parse(request.messages[0].content.split("\n")[2]);
      return message("fill_custom_section", { section: generatedSection(current.goal) });
    });
    const progress: string[] = [];
    const result = await buildGeneratedSite({
      ...input, businessType: type, generationMode: "custom", desiredPages, desiredSections: extras,
      styleDirection: "organic", fontDirection: "serif", designDescription: "Warm natural materials.",
    }, ({ message }) => progress.push(message), requestId);
    expect(result).toMatchObject({ siteId, pageId });
    expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(accountId, siteId, desiredPages.length);
    expect(mocks.request.mock.calls.map(([request]) => request.toolName))
      .toEqual(["plan_custom_site", ...Array(desiredPages.length + extras.length).fill("fill_custom_section")]);
    for (const [request] of mocks.request.mock.calls) {
      expect(request).toMatchObject({
        action: "generate_site", tools: [{ strict: request.toolName === "plan_custom_site" }],
        cacheTtl: "5m", system: customSystemPrompt(), generationId, correlationId: requestId,
      });
    }
    const save = savedPayload();
    expect(save.p_pages.map((page: { slug: string }) => page.slug)).toEqual(desiredPages);
    expect(save.p_pages[0].data.content.length).toBeGreaterThanOrEqual(3);
    expect(save.p_pages[0]).toMatchObject({ nav_label: "Home", data: { root: { props: { title: "Home", seoTitle: seo.title, description: seo.description } } } });
    expect(save.p_pages[0].data.content.at(-1)).toMatchObject({ type: "Footer" });
    if (desiredPages.includes("contact")) {
      expect(save.p_pages.find((page: { slug: string }) => page.slug === "contact").data.content.map((block: { type: string }) => block.type))
        .toEqual(["Navigation", "Section", "ContactForm", "Footer"]);
    }
    expect(save.p_pages[0].data.content[1]).toMatchObject({ type: "Section" });
    const rows = save.p_pages[0].data.content[1].props.rows as {
      type: string;
      props: { columns: { type: string; props: { content: { type: string }[] } }[] };
    }[];
    expect(rows[0].props.columns[0].props.content[0].type).toBe("Heading");
    expect(save).not.toHaveProperty("p_theme");
    expect(progress[0]).toBe("Planning your site…");
    expect(progress.some((entry) => entry.startsWith("Designing Home"))).toBe(true);
    expect(progress.at(-1)).toBe("Unpublished drafts saved.");
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it("repairs a plan with the original brief, actual tool ID and actionable issue; logs no generated values", async () => {
    const valid = customPlan([""], ["faq"]);
    const invalid = structuredClone(valid);
    invalid.pages.home.sections[1] = { kind: "invalid", goal: "PRIVATE GENERATED VALUE" };
    const first = { ...message("plan_custom_site", invalid), _request_id: "req_first_attempt" };
    mocks.request.mockResolvedValueOnce(first)
      .mockResolvedValueOnce(message("plan_custom_site", valid))
      .mockResolvedValue(message("fill_custom_section", { section: generatedSection("Site section") }));
    await buildGeneratedSite({ ...input, generationMode: "custom", desiredPages: [""], desiredSections: ["faq"] }, undefined, requestId);
    const [initial, assistant, feedback] = mocks.request.mock.calls[1][0].messages;
    expect(initial).toEqual(mocks.request.mock.calls[0][0].messages[0]);
    expect(initial.content).toContain('"desiredSections":["faq"]');
    expect(assistant).toEqual({ role: "assistant", content: first.content });
    expect(feedback.content[0]).toMatchObject({
      type: "tool_result", tool_use_id: "toolu_test", is_error: true, content: expect.stringContaining("pages.home.sections.1.kind (invalid_value)"),
    });
    expect(console.info).toHaveBeenCalledWith("AI custom generation attempt", expect.objectContaining({
      requestId, generationId, attempt: 1, providerRequestId: "req_first_attempt", outcome: "validation_failed",
      issues: [expect.objectContaining({ path: "pages.home.sections.1.kind", code: "invalid_value", received: "string(7)" })],
    }));
    expect(console.info).toHaveBeenCalledWith("AI custom generation attempt", expect.objectContaining({ requestId, attempt: 2, outcome: "valid" }));
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("PRIVATE GENERATED VALUE");
  });

  it("saves the earlier custom draft when a later page still fails after its automatic retry", async () => {
    const good = generatedSection("Welcome");
    const invalid = structuredClone(good);
    invalid.rows[0].columns[0].elements = [{ type: "Heading", text: "Malformed", level: "h9", align: "left" }];
    mocks.request.mockResolvedValueOnce(message("plan_custom_site", customPlan(["", "services"])))
      .mockResolvedValueOnce(message("fill_custom_section", { section: good }))
      .mockResolvedValueOnce(message("fill_custom_section", { section: invalid }))
      .mockResolvedValueOnce(message("fill_custom_section", { section: invalid }));
    mocks.request.mockResolvedValue(message("fill_custom_section", { section: invalid }));
    await expect(buildGeneratedSite({ ...input, generationMode: "custom", desiredPages: ["", "services"] }))
      .resolves.toMatchObject({ pages: [{ slug: "", built: true }, { slug: "services", built: false, retryId }] });
    expect(mocks.request).toHaveBeenCalledTimes(6);
    expect(mocks.request.mock.calls[3][0].messages[2].content[0]).toMatchObject({
      type: "tool_result", content: expect.stringContaining("section.rows.0.columns.0.elements.0.level (invalid_value)"),
    });
    expect(savedPayload()).toMatchObject({ p_pages: [
      expect.objectContaining({ slug: "", data: expect.any(Object) }), expect.objectContaining({ slug: "services", data: null }),
    ] });
  });

  it("distinguishes truncation and never echoes a partial tool call back to the provider", async () => {
    mocks.request.mockResolvedValue({ ...message("plan_custom_site", {}), stop_reason: "max_tokens" });
    await expect(buildGeneratedSite({ ...input, generationMode: "custom", desiredPages: [""] }))
      .rejects.toThrow("response for the website plan was incomplete");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    const repair = mocks.request.mock.calls[1][0].messages;
    expect(repair).toEqual([{ role: "user", content: expect.stringContaining('"desiredPages":[""]') }]);
    expect(repair[0].content).toContain("previous response was incomplete");
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(generationId, false);
  });

  it("exposes at most five sanitized validation issues to super admins only", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_super_admin", error: null }));
    mocks.request.mockResolvedValue(message("plan_custom_site", {
      style: "invalid", colors: { primary: "bad", secondary: "bad", background: "bad", text: "bad" },
      fonts: { heading: "bad", body: "bad" }, pages: {},
    }));
    await expect(buildGeneratedSite({ ...input, generationMode: "custom", desiredPages: [""] }))
      .rejects.toMatchObject({ validationIssues: Array(5).fill(expect.objectContaining({ code: expect.any(String), message: expect.any(String) })) });
  });
});
