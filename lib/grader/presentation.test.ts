import { describe, expect, it, vi } from "vitest";
import { graderCtaUrl } from "./presentation";

describe("grader CTA", () => {
  it("uses configured URL and adds report attribution", () => {
    vi.stubEnv("NEXT_PUBLIC_GRADER_CTA_URL", "https://sitomax.com/contact?campaign=existing");
    const url = new URL(graderCtaUrl("example-123")!);
    expect(url.searchParams.get("campaign")).toBe("existing");
    expect(url.searchParams.get("ref")).toBe("grader");
    expect(url.searchParams.get("report")).toBe("example-123");
    vi.unstubAllEnvs();
  });
  it("rejects unsafe or absent destinations", () => {
    vi.stubEnv("NEXT_PUBLIC_GRADER_CTA_URL", "javascript:alert(1)");
    expect(graderCtaUrl("example-123")).toBeNull();
    vi.unstubAllEnvs();
  });
});
