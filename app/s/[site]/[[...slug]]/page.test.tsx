import { Children, isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.access }) }) }) }),
}));
vi.mock("@/lib/tenant", () => ({
  getSiteByHost: async () => ({ id: "site", theme: {} }),
  getSitePage: async () => ({ id: "page", draft_data: { content: [] }, published_data: { content: [] } }),
}));
vi.mock("@/lib/puck/config", () => ({ puckConfig: {} }));
vi.mock("@puckeditor/core/rsc", () => ({ Render: () => null }));
vi.mock("@/components/tenant-font-hints", () => ({ TenantFontHints: () => null }));
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import TenantSitePage from "./page";

beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({ data: null, error: null });
});

async function hasBeacon(preview?: string) {
  const result = await TenantSitePage({
    params: Promise.resolve({ site: "client" }),
    searchParams: Promise.resolve(preview ? { preview } : {}),
  });
  return Children.toArray(result.props.children).some((child) => isValidElement(child) && child.type === AnalyticsBeacon);
}

describe("tenant analytics eligibility", () => {
  it("tracks published pages only for visitors without page access", async () => {
    expect(await hasBeacon()).toBe(true);
    mocks.access.mockResolvedValue({ data: { id: "page" }, error: null });
    expect(await hasBeacon()).toBe(false);
  });
  it("never tracks preview URLs, even when preview access is denied", async () => {
    expect(await hasBeacon("1")).toBe(false);
    mocks.access.mockResolvedValue({ data: { id: "page" }, error: null });
    expect(await hasBeacon("1")).toBe(false);
  });
  it("fails closed when the access check fails", async () => {
    mocks.access.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await hasBeacon()).toBe(false);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
