import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getTenantKeyFromHost: () => "client" }));
vi.mock("@/lib/redirect-lookup", () => ({ lookupTenantRedirect: mocks.lookup }));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: () => NextResponse.next() }));
import { proxy } from "./proxy";

describe("tenant redirect routing", () => {
  it("returns a 301 for configured paths and skips redirects in preview", async () => {
    mocks.lookup.mockResolvedValue("/new");
    const request = new NextRequest("https://client.test/old", { headers: { host: "client.test" } });
    const response = await proxy(request);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://client.test/new");
    mocks.lookup.mockClear();
    const preview = await proxy(new NextRequest("https://client.test/old?preview=1", { headers: { host: "client.test" } }));
    expect(preview.headers.get("x-middleware-rewrite")).toContain("/s/client/old");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
