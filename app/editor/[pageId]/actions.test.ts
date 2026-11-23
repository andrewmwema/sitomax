import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(), update: vi.fn(), updated: vi.fn(), version: vi.fn(), profile: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ user: { id: "user-1" }, supabase: {
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) };
      if (table === "page_versions") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.version }) }) }) };
      return {
        select: () => ({ eq: () => ({ maybeSingle: mocks.load }) }),
        update: mocks.update,
      };
    },
  } }),
}));

import { publishPage, restorePageVersion, savePageDraft, savePageMenuLabel } from "./actions";
import { defaultHeader } from "@/lib/header";
const PAGE = "00000000-0000-4000-8000-000000000001";
const VERSION = "00000000-0000-4000-8000-000000000002";
const BASE = "00000000-0000-4000-8000-000000000003";
const payload = () => ({ root: { props: { title: "Test" } }, content: [{
  type: "Text", props: { id: "text", text: "<p>Hello</p><script>bad()</script>" },
}] });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockResolvedValue({ data: { id: PAGE, title: "Test", seo: {}, draft_data: {}, published_data: {},
    site: { draft_header: null, theme: {}, draft_theme: null } }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: () => ({ select: mocks.updated }) });
  mocks.updated.mockResolvedValue({ data: [{ id: PAGE }], error: null });
  mocks.version.mockResolvedValue({ data: { data: payload() }, error: null });
  mocks.profile.mockResolvedValue({ data: { is_super_admin: false } });
});
describe("editor persistence", () => {
  it("writes only the validated menu label, independent of title and SEO", async () => {
    expect(await savePageMenuLabel(PAGE, "One Two Three Four")).toMatchObject({ status: "error" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(await savePageMenuLabel(PAGE, " Our   Work ")).toMatchObject({ status: "success" });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ nav_label: "Our Work" });
  });
  it("publishes SEO fields without exposing draft metadata early", async () => {
    const data = { root: { props: { title: "Page", seoTitle: "Search title", description: "Search description", socialImage: "/share.jpg", indexing: "noindex" } }, content: [] };
    expect(await savePageDraft(PAGE, data, BASE)).toMatchObject({ status: "success" });
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("seo");
    expect(await publishPage(PAGE, data, BASE)).toMatchObject({ status: "success" });
    expect(mocks.update.mock.calls[1][0].seo).toMatchObject({ title: "Search title", description: "Search description", image: "/share.jpg", noindex: true });
  });
  it("keeps generated SEO draft-only during autosave and applies it on explicit publish", async () => {
    mocks.load.mockResolvedValue({ data: { id: PAGE, title: "Published page", seo: {
      title: "Published SEO", description: "Published description", image: "/existing-social-image.jpg",
    }, draft_data: {}, published_data: {} }, error: null });
    const data = { root: { props: { title: "Generated SEO title", description: "Generated description" } }, content: [] };
    expect(await savePageDraft(PAGE, data, BASE)).toMatchObject({ status: "success" });
    expect(mocks.update.mock.calls.at(-1)![0]).toMatchObject({ draft_data: data });
    expect(await publishPage(PAGE, data, BASE)).toMatchObject({ status: "success" });
    expect(mocks.update.mock.calls.at(-1)![0]).toMatchObject({
      draft_data: data, published_data: data, published_at: expect.any(String), title: "Generated SEO title",
      seo: { title: "Generated SEO title", description: "Generated description", image: "/existing-social-image.jpg" },
    });
  });
  it("only writes published data when publishing and sanitizes both paths", async () => {
    expect(await savePageDraft(PAGE, payload(), BASE)).toMatchObject({ status: "success" });
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("published_data");
    expect(await publishPage(PAGE, payload(), BASE)).toMatchObject({ status: "success" });
    const update = mocks.update.mock.calls[1][0];
    expect(update.published_data).toEqual(update.draft_data);
    expect(update.published_data.content[0].props.text).toBe("<p>Hello</p>");
  });
  it("restores a permitted historical version to draft, leaving live content untouched", async () => {
    const result = await restorePageVersion(PAGE, VERSION, BASE);
    expect(result).toMatchObject({ status: "success", data: { content: [{ props: { text: "<p>Hello</p>" } }] } });
    expect(mocks.rpc).toHaveBeenCalledWith("save_page_with_header", expect.objectContaining({ p_publish: false }));
  });
  it("does not bypass agency Embed restrictions when restoring history", async () => {
    mocks.version.mockResolvedValueOnce({ data: { data: {
      root: { props: {} }, content: [{ type: "Embed", props: { id: "embed", code: "<script>x()</script>" } }],
    } }, error: null });
    expect(await restorePageVersion(PAGE, VERSION, BASE)).toMatchObject({ status: "error", message: expect.stringContaining("agency") });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("atomically saves a validated header with its expected baseline, without persisting transient root props", async () => {
    const header = defaultHeader("Example");
    const baseline = { version: 1 };
    const data = { ...payload(), root: { props: { ...payload().root.props, __editorHeader: header, __expectedHeader: baseline } } };
    expect(await savePageDraft(PAGE, data, BASE)).toMatchObject({ status: "success" });
    const args = mocks.rpc.mock.calls[0][1];
    expect(args).toMatchObject({ p_header: header, p_expected_header: baseline, p_publish: false });
    expect(args.p_data.root.props).not.toHaveProperty("__editorHeader");
    expect(args.p_data.root.props).not.toHaveProperty("__expectedHeader");
    expect(args.p_data.content[0].props.text).toBe("<p>Hello</p>");
    mocks.rpc.mockResolvedValueOnce({ error: { code: "40001" } });
    expect(await publishPage(PAGE, data, BASE)).toMatchObject({ status: "error", conflict: true, message: expect.stringContaining("another editor") });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rolls back to the untouched Navigation while suppressing the global header on that page", async () => {
    mocks.version.mockResolvedValueOnce({ data: { data: { ...payload(), content: [
      { type: "Navigation", props: { businessName: "Original", buttonText: "Contact", buttonLink: "/contact" } },
      ...payload().content,
    ] }, header: null }, error: null });
    expect(await restorePageVersion(PAGE, VERSION, BASE)).toMatchObject({ status: "success",
      data: { root: { props: { __legacyNavigation: true } } } });
    const args = mocks.rpc.mock.calls[0][1];
    expect(args.p_data.content.map((item: { type: string }) => item.type)).toEqual(["Navigation", "Text"]);
    expect(args.p_data.content[0].props.businessName).toBe("Original");
    expect(args.p_data.root.props.__legacyNavigation).toBe(true);
  });
  it("keeps history restoration functional before the header migration is installed", async () => {
    mocks.version.mockResolvedValueOnce({ data: null, error: { code: "42703", message: "column page_versions.header does not exist" } });
    expect(await restorePageVersion(PAGE, VERSION, BASE)).toMatchObject({ status: "success" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ draft_data: expect.any(Object) }));
  });

  it("passes the exact loaded version to the atomic guard and returns only the successful replacement token", async () => {
    const result = await savePageDraft(PAGE, payload(), BASE);
    const props = mocks.update.mock.calls[0][0].draft_data.root.props;
    expect(props.__expectedPageVersion).toBe(BASE);
    expect(result).toMatchObject({ status: "success", version: props.__nextPageVersion });
    mocks.updated.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    expect(await savePageDraft(PAGE, payload(), BASE)).toMatchObject({ status: "error", conflict: true, message: expect.stringContaining("Reload") });
  });
});
