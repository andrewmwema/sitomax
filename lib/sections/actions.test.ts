import { beforeEach, describe, expect, it, vi } from "vitest";

const { order, insert, profile, update, updateOne } = vi.hoisted(() => ({
  order: vi.fn(), insert: vi.fn(), profile: vi.fn(), update: vi.fn(), updateOne: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({
    user: { id: "user-1" },
    supabase: { from: (table: string) => table === "profiles"
      ? { select: () => ({ eq: () => ({ maybeSingle: profile }) }) }
      : { select: () => ({ order }), insert, update } },
  }),
}));

import { listSavedDesigns, saveSectionDesign, setDesignGlobal } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  insert.mockResolvedValue({ error: null });
  profile.mockResolvedValue({ data: { is_super_admin: false }, error: null });
  update.mockReturnValue({ eq: () => ({ select: () => ({ single: updateOne }) }) });
  updateOne.mockResolvedValue({ data: { id: "design-1" }, error: null });
});

describe("saved design loading", () => {
  it("reports database failures instead of presenting a successful empty library", async () => {
    const error = { message: "Connection unavailable", code: "CONNECTION_ERROR" };
    order.mockResolvedValueOnce({ data: null, error });
    await expect(listSavedDesigns()).rejects.toMatchObject({
      message: "Unable to load saved section designs", cause: error,
    });
  });

  it("normalizes legacy categories and identifies ownership without filtering out private designs", async () => {
    order.mockResolvedValueOnce({ error: null, data: [{
      id: "design-1", name: "My service cards", block_type: "Services", category: "Features/Services",
      props: {}, thumbnail_url: "legacy.png", created_by: "user-1", is_global: false,
    }] });
    expect(await listSavedDesigns()).toMatchObject([{
      category: "Services", saved: { id: "design-1", isOwner: true, isGlobal: false },
    }]);
  });
});

describe("saved design permissions", () => {
  const design = { name: "My layout", category: "Text blocks", blockType: "TextSection",
    props: { id: "old-instance", text: "<p>Hello</p><script>bad()</script>" } };

  it("saves a client's private design with sanitized content and authenticated ownership", async () => {
    expect(await saveSectionDesign(design)).toMatchObject({ status: "success" });
    expect(profile).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      created_by: "user-1", is_global: false, props: { text: "<p>Hello</p>" },
    }));
  });

  it("rejects client attempts to create or promote a global design", async () => {
    expect(await saveSectionDesign({ ...design, isGlobal: true })).toMatchObject({ status: "error" });
    expect(await setDesignGlobal({ id: "00000000-0000-4000-8000-000000000001", isGlobal: true }))
      .toMatchObject({ status: "error" });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("lets the agency save and mark designs global", async () => {
    profile.mockResolvedValue({ data: { is_super_admin: true }, error: null });
    expect(await saveSectionDesign({ ...design, isGlobal: true })).toMatchObject({ status: "success" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ is_global: true }));
    expect(await setDesignGlobal({ id: "00000000-0000-4000-8000-000000000001", isGlobal: true }))
      .toMatchObject({ status: "success" });
    expect(update).toHaveBeenCalledWith({ is_global: true });
  });
});
