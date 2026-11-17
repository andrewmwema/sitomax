import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), insert: vi.fn(), selected: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: {
  from: () => ({ update: mocks.update, insert: mocks.insert }),
} }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { addRedirect, saveSeo } from "./actions";

const site = "00000000-0000-4000-8000-000000000001";
const initial = { error: "", success: "" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockReturnValue({ eq: () => ({ select: mocks.selected }) });
  mocks.selected.mockResolvedValue({ data: [{ id: site }], error: null });
  mocks.insert.mockResolvedValue({ error: null });
});
describe("SEO actions", () => {
  it("saves only validated SEO settings via the member-scoped client", async () => {
    const form = new FormData();
    form.set("socialImage", "/share.jpg"); form.set("googleAnalyticsId", "G-ABCD");
    form.set("metaPixelId", ""); form.set("googleVerification", "verify"); form.set("noindex", "on");
    expect(await saveSeo(site, initial, form)).toMatchObject({ error: "" });
    expect(mocks.update).toHaveBeenCalledWith({ seo: {
      socialImage: "/share.jpg", googleAnalyticsId: "G-ABCD", metaPixelId: "", googleVerification: "verify", noindex: true,
    } });
    form.set("googleAnalyticsId", "invalid");
    expect((await saveSeo(site, initial, form)).error).toBeTruthy();
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("rejects off-site, self-referential and reserved redirects", async () => {
    const form = new FormData(); form.set("fromPath", "/old"); form.set("toPath", "//evil.test");
    expect((await addRedirect(site, initial, form)).error).toBeTruthy();
    form.set("toPath", "/old");
    expect((await addRedirect(site, initial, form)).error).toBeTruthy();
    form.set("fromPath", "/api/secret"); form.set("toPath", "/new");
    expect((await addRedirect(site, initial, form)).error).toBeTruthy();
    form.set("fromPath", "/old");
    expect((await addRedirect(site, initial, form)).error).toBe("");
    expect(mocks.insert).toHaveBeenCalledWith({ site_id: site, from_path: "/old", to_path: "/new" });
  });
});
