import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: mocks.authorize }));
import GraderPage from "./page";

it("checks super-admin access before rendering the grader", async () => {
  mocks.authorize.mockRejectedValue(new Error("not authorized"));
  await expect(GraderPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("not authorized");
  expect(mocks.authorize).toHaveBeenCalledOnce();
});
