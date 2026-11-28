import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), pdf: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/grader/worker", () => ({ graderRpc: mocks.rpc }));
vi.mock("@/lib/grader/pdf", () => ({ cachedGraderPdf: mocks.pdf }));
import { GET } from "./route";
import { signedGraderPdfPath } from "@/lib/grader/pdf-link";

const slug = "example-0123456789abcdef";
const report = {
  slug, url: "https://example.com/", domain: "example.com", status: "complete", progress: {}, scores: null,
  screenshot_url: null, unlocked: true, share_disabled: false, headline: null, top_issues: null,
  results: { checks: [], places_enabled: false }, ai_summary: null,
};
const call = (path: string) => GET(new Request(`https://agency.test${path}`), { params: Promise.resolve({ slug }) });

beforeEach(() => {
  vi.stubEnv("GRADER_WORKER_SECRET", "w".repeat(40));
  mocks.rpc.mockReset().mockResolvedValue(report);
  mocks.pdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

describe("shared grader PDF download", () => {
  it("serves the PDF for a valid signed link", async () => {
    const response = await call(signedGraderPdfPath(slug)!);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ slug }));
  });

  it("rejects unsigned links without reading the report", async () => {
    expect((await call(`/grade/${slug}/pdf?expires=9999999999&sig=bad`)).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["disabled", { ...report, share_disabled: true }],
    ["locked", { ...report, unlocked: false, results: undefined, ai_summary: undefined }],
    ["missing", null],
  ])("returns 404 when the share link is %s", async (_name, value) => {
    mocks.rpc.mockResolvedValue(value);
    expect((await call(signedGraderPdfPath(slug)!)).status).toBe(404);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it("logs and returns a retryable error when rendering fails", async () => {
    mocks.pdf.mockRejectedValue(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(signedGraderPdfPath(slug)!);
    expect(response.status).toBe(503);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
