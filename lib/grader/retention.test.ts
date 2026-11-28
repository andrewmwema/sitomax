import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./pdf", () => ({ graderPdfPath: (slug: string) => `v3/${slug}.pdf` }));
vi.mock("./worker", () => ({
  graderRpc: mocks.rpc,
  graderWorker: () => ({ client: { storage: { from: mocks.from } } }),
}));
import { processGraderRetention } from "./retention";

const id = "50da05be-c0bc-4d58-a49f-44f59f44bf09";
const expired = { retention_days: 90, reports: [{ id, slug: "old-site-0123456789abcdef", screenshot_url: null }] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((bucket: string) => ({ remove: (paths: string[]) => mocks.remove(bucket, paths) }));
  mocks.remove.mockResolvedValue({ data: [], error: null });
});

describe("grader retention", () => {
  it("removes screenshots and cached PDFs before deleting expired rows", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "grader_retention_expired" ? expired : 1);
    const result = await processGraderRetention();
    expect(result).toEqual({ retentionDays: 90, deleted: 1, failures: 0 });
    expect(mocks.remove).toHaveBeenCalledWith("grader-screenshots", [`${id}.jpg`, `${id}.png`]);
    expect(mocks.remove).toHaveBeenCalledWith("grader-reports", ["v3/old-site-0123456789abcdef.pdf"]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("grader_delete_expired", { p_ids: [id] });
    expect(mocks.rpc.mock.invocationCallOrder.at(-1)).toBeGreaterThan(mocks.remove.mock.invocationCallOrder.at(-1)!);
  });

  it("keeps rows when stored files could not be removed", async () => {
    mocks.rpc.mockResolvedValue(expired);
    mocks.remove.mockResolvedValueOnce({ data: null, error: new Error("denied") });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await processGraderRetention()).toMatchObject({ deleted: 0, failures: 1 });
    expect(mocks.rpc).not.toHaveBeenCalledWith("grader_delete_expired", expect.anything());
    error.mockRestore();
  });

  it("does nothing when no scans have expired", async () => {
    mocks.rpc.mockResolvedValue({ retention_days: 30, reports: [] });
    expect(await processGraderRetention()).toEqual({ retentionDays: 30, deleted: 0, failures: 0 });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
