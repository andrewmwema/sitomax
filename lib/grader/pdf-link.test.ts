import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { GRADER_PDF_LINK_TTL_SECONDS, signedGraderPdfPath, verifyGraderPdfLink } from "./pdf-link";

const now = Date.UTC(2026, 0, 1);
function parts(path: string) {
  const url = new URL(path, "https://agency.test");
  return [url.searchParams.get("expires"), url.searchParams.get("sig")] as const;
}

beforeEach(() => vi.stubEnv("GRADER_WORKER_SECRET", "w".repeat(40)));
afterEach(() => vi.unstubAllEnvs());

describe("signed grader PDF links", () => {
  it("accepts a fresh link only for its own slug", () => {
    const path = signedGraderPdfPath("example-123", now)!;
    expect(path.startsWith("/grade/example-123/pdf?")).toBe(true);
    expect(verifyGraderPdfLink("example-123", ...parts(path), now)).toBe(true);
    expect(verifyGraderPdfLink("other-123", ...parts(path), now)).toBe(false);
  });

  it("rejects expired, tampered and far-future links", () => {
    const [expires, sig] = parts(signedGraderPdfPath("example-123", now)!);
    expect(verifyGraderPdfLink("example-123", expires, sig, now + (GRADER_PDF_LINK_TTL_SECONDS + 1) * 1000)).toBe(false);
    expect(verifyGraderPdfLink("example-123", String(Number(expires) + 1), sig, now)).toBe(false);
    expect(verifyGraderPdfLink("example-123", expires, `${sig}x`, now)).toBe(false);
    const future = signedGraderPdfPath("example-123", now + 10 * 86_400_000)!;
    expect(verifyGraderPdfLink("example-123", ...parts(future), now)).toBe(false);
  });

  it("is unavailable without the worker secret", () => {
    vi.stubEnv("GRADER_WORKER_SECRET", "");
    expect(signedGraderPdfPath("example-123", now)).toBeNull();
    expect(verifyGraderPdfLink("example-123", "1", "x", now)).toBe(false);
  });
});
