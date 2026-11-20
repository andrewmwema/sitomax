import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
import { updateSession } from "./proxy";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  mocks.getUser.mockReset();
});

describe("app host session routing", () => {
  it("sends signed-out and signed-in app root visitors to login and dashboard", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    const signedOut = await updateSession(new NextRequest("https://app.example.test/"));
    expect(signedOut.headers.get("location")).toBe("https://app.example.test/login");

    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "user" } } });
    const signedIn = await updateSession(new NextRequest("https://app.example.test/"));
    expect(signedIn.headers.get("location")).toBe("https://app.example.test/dashboard");
  });

  it("keeps protected dashboard routes gated", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await updateSession(new NextRequest("https://app.example.test/dashboard/settings"));
    expect(response.headers.get("location")).toBe("https://app.example.test/login?next=%2Fdashboard%2Fsettings");
  });

  it("returns signed-out notification recipients to the specific lead after login", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const id = "00000000-0000-4000-8000-000000000003";
    const response = await updateSession(new NextRequest(`https://app.example.test/dashboard/forms?lead=${id}&q=private`));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("next")).toBe(`/dashboard/forms?lead=${id}`);
  });
});
