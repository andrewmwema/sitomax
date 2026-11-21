import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ settings: { faviconUrl: "/agency-icon.png" as string | null } }));
vi.mock("@/lib/agency", () => ({ getAgencySettings: async () => mocks.settings }));
import { generateMetadata } from "./layout";

describe("platform metadata", () => {
  beforeEach(() => { mocks.settings = { faviconUrl: "/agency-icon.png" }; });

  it("does not inject a root favicon that competes with tenant icons", () => {
    expect(existsSync(new URL("./favicon.ico", import.meta.url))).toBe(false);
  });

  it("uses the agency favicon and falls back to the built-in icon when none is set", async () => {
    expect((await generateMetadata()).icons).toEqual({
      icon: "/agency-icon.png", shortcut: "/agency-icon.png",
    });
    mocks.settings = { faviconUrl: null };
    expect((await generateMetadata()).icons).toEqual({ icon: "/icon.svg", shortcut: "/icon.svg" });
  });
});
