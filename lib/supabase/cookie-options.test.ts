import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./cookie-options";

describe("Supabase auth cookie scope", () => {
  it("uses host-only cookies", () => {
    expect(authCookieOptions()).toEqual({ path: "/", sameSite: "lax" });
  });
});
