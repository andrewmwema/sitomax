import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchPage: vi.fn(), rpc: vi.fn(), speed: vi.fn(), security: vi.fn(), crawler: vi.fn(),
  places: vi.fn(), summary: vi.fn(),
}));
vi.mock("./fetch", () => ({ fetchGraderUrl: mocks.fetchPage }));
vi.mock("./worker", () => ({ graderRpc: mocks.rpc, graderWorker: vi.fn() }));
vi.mock("./pagespeed", () => ({ runPageSpeed: mocks.speed }));
vi.mock("./network-checks", () => ({ securityChecks: mocks.security, crawlerChecks: mocks.crawler }));
vi.mock("./places", () => ({ placesChecks: mocks.places, isPlacesEnabled: () => true }));
vi.mock("./summary", () => ({ makeSummary: mocks.summary }));

import { processGraderReport } from "./scan";

const id = "50da05be-c0bc-4d58-a49f-44f59f44bf09";
const input = { url: "https://example.com/" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue(null);
  mocks.speed.mockResolvedValue({ checks: [], screenshot: null });
  mocks.security.mockResolvedValue([]);
  mocks.crawler.mockResolvedValue([]);
  mocks.places.mockResolvedValue([]);
  mocks.summary.mockResolvedValue(null);
});

describe("scan processing", () => {
  it("continues PageSpeed when the HTML fetch is blocked", async () => {
    mocks.fetchPage.mockResolvedValue({ status: 403, url: input.url, headers: {}, body: Buffer.alloc(0) });
    await processGraderReport(id, input);
    expect(mocks.speed).toHaveBeenCalledTimes(2);
    expect(mocks.security).toHaveBeenCalledWith(input.url, true);
    const updates = mocks.rpc.mock.calls.filter(([name]) => name === "grader_update_report").map(([, args]) => args.p_update);
    const complete = updates.find((update) => update.status === "complete");
    expect(complete).toBeDefined();
    expect(complete.results.checks.find((check: { id: string }) => check.id === "title").status).toBe("unknown");
    expect(complete.progress.summary).toBe("unknown");
  });

  it("reuses matching cached results after resolving the final URL", async () => {
    mocks.fetchPage.mockResolvedValue({ status: 200, url: input.url, headers: {}, body: Buffer.from("<html></html>") });
    mocks.rpc.mockImplementation(async (name) => name === "grader_get_cache"
      ? { results: { places_enabled: true, checks: [] }, scores: {}, ai_summary: null, screenshot_url: null } : null);
    await processGraderReport(id, input);
    expect(mocks.speed).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("grader_update_report",
      expect.objectContaining({ p_update: expect.objectContaining({ status: "complete" }) }));
  });

  it("marks the report failed if the safe fetch cannot complete", async () => {
    mocks.fetchPage.mockRejectedValue(new Error("blocked"));
    await processGraderReport(id, input);
    expect(mocks.rpc).toHaveBeenCalledWith("grader_update_report",
      expect.objectContaining({ p_update: expect.objectContaining({ status: "failed" }) }));
  });
});
