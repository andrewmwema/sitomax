import { describe, expect, it, vi } from "vitest";

const { order } = vi.hoisted(() => ({ order: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({
    supabase: { from: () => ({ select: () => ({ eq: () => ({ order }) }) }) },
  }),
}));

import { listSavedDesigns } from "./actions";

describe("saved design loading", () => {
  it("reports database failures instead of presenting a successful empty library", async () => {
    const error = { message: "Connection unavailable", code: "CONNECTION_ERROR" };
    order.mockResolvedValueOnce({ data: null, error });
    await expect(listSavedDesigns()).rejects.toMatchObject({
      message: "Unable to load saved section designs", cause: error,
    });
  });
});
