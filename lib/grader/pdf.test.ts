import { PDFDocument } from "pdf-lib";
import { StorageApiError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), upload: vi.fn() }));
vi.mock("./worker", () => ({
  graderRpc: mocks.rpc,
  graderWorker: () => ({ client: { storage: { from: () => ({ download: mocks.download, upload: mocks.upload }) } } }),
}));
import { graderPdf, renderGraderPdf } from "./pdf";

const report = {
  slug: "example-123", url: "https://example.com/", domain: "example.com", status: "complete" as const,
  progress: {}, scores: { overall: 80, grade: "B", categories: { seo: 80 } }, screenshot_url: null,
  unlocked: true, headline: "Headline", top_issues: [],
  results: { places_enabled: false, checks: [{
    id: "title", category: "seo" as const, status: "warn" as const, value: "A title",
    detail: "Title could be longer.", fix: "Write a descriptive title.",
  }] },
  ai_summary: { headline: "Headline", summary: "A summary.", top_issues: [], fix_plan: ["Fix your title."], sitomax_pitch: "We can help." },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_GRADER_CTA_URL", "https://sitomax.com/contact");
  mocks.rpc.mockResolvedValue(report);
  mocks.download.mockResolvedValue({ data: null, error: new StorageApiError("Object not found", 400, "400", "storage", "NoSuchKey") });
  mocks.upload.mockResolvedValue({ error: null });
});
describe("grader PDF", () => {
  it("generates a real multi-page PDF for the unlocked report", async () => {
    const pdf = await PDFDocument.load(await renderGraderPdf({
      ...report, results: { ...report.results, checks: Array.from({ length: 60 }, (_, index) => ({
        ...report.results.checks[0], id: `check_${index}`,
      })) },
    }));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toContain("website report");
  }, 20_000);
  it("caches PDFs and never returns one for locked reports", async () => {
    const bytes = await graderPdf(report.slug);
    expect(bytes?.length).toBeGreaterThan(1000);
    expect(mocks.upload).toHaveBeenCalledOnce();
    mocks.rpc.mockResolvedValue({ ...report, unlocked: false, results: undefined, ai_summary: undefined });
    expect(await graderPdf(report.slug)).toBeNull();
    expect(mocks.download).toHaveBeenCalledOnce();
  }, 20_000);
  it("only generates on a missing object, not a missing bucket or permission failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.download.mockResolvedValue({ data: null, error: new StorageApiError("Bucket not found", 404, "404", "storage", "NoSuchBucket") });
      await expect(graderPdf(report.slug)).rejects.toThrow("Could not read the cached grader PDF.");
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("Grader PDF failed", { stage: "read cache", type: "StorageApiError", status: 404, code: "NoSuchBucket" });
    } finally { log.mockRestore(); }
  });
  it("reads the existing PDF when a concurrent generation won the upload race", async () => {
    mocks.upload.mockResolvedValue({ error: new StorageApiError("Duplicate", 400, "400", "storage", "Duplicate") });
    mocks.download.mockResolvedValueOnce({ data: null, error: new StorageApiError("Not found", 400, "400", "storage", "NoSuchKey") })
      .mockResolvedValueOnce({ data: new Blob(["existing"]), error: null });
    expect(Buffer.from((await graderPdf(report.slug))!).toString()).toBe("existing");
  }, 20_000);
  it("does not fetch an untrusted screenshot URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example.com");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(renderGraderPdf({ ...report, screenshot_url: "https://attacker.example/screenshot.png" })).rejects.toThrow("Invalid grader screenshot URL");
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
