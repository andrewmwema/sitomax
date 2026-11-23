import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword: mocks.signIn } }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { signInWithPassword } from "./actions";

beforeEach(() => vi.resetAllMocks());

it.each(["", "#reply"])("returns a notification recipient to the same conversation after password login (%s)", async (fragment) => {
  const next = `/dashboard/leads/00000000-0000-4000-8000-000000000003${fragment}`;
  mocks.signIn.mockResolvedValue({ error: null });
  const form = new FormData();
  form.set("email", "owner@example.test");
  form.set("password", "test-password");
  form.set("next", next);
  await signInWithPassword({ status: "idle" }, form);
  expect(mocks.signIn).toHaveBeenCalledWith({ email: "owner@example.test", password: "test-password" });
  expect(mocks.redirect).toHaveBeenCalledWith(next);
});
