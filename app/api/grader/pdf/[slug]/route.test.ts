import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pdf: vi.fn() }));
vi.mock("@/lib/grader/pdf", () => ({ graderPdf: mocks.pdf }));
import { GET } from "./route";

const request = new Request("https://sitomax.com/grader/example-123/pdf");
const params = { params: Promise.resolve({ slug: "example-123" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

it("returns a PDF for an unlocked report and rejects locked reports", async () => {
  const response = await GET(request, params);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("cache-control")).toBe("no-store");
  mocks.pdf.mockResolvedValue(null);
  expect((await GET(request, params)).status).toBe(404);
});

it("returns a generic error when generation fails", async () => {
  mocks.pdf.mockRejectedValue(new Error("private diagnostic"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await GET(request, params);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Couldn't download the PDF. Please try again." });
  } finally { log.mockRestore(); }
});
