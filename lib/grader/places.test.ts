import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fetchPage: vi.fn() }));
vi.mock("./worker", () => ({ graderRpc: mocks.rpc }));
vi.mock("./fetch", () => ({ fetchGraderUrl: mocks.fetchPage }));
import { placesChecks, PLACES_FIELD_MASK } from "./places";

const reportId = "50da05be-c0bc-4d58-a49f-44f59f44bf09";
const callId = "51da05be-c0bc-4d58-a49f-44f59f44bf09";
const input = { url: "https://example.com", businessName: "Joe Plumbing", city: "Austin" };
const place = { displayName: { text: "Joe Plumbing" }, formattedAddress: "1 Main St Austin",
  nationalPhoneNumber: "(512) 555-0123", rating: 4.7, userRatingCount: 19, websiteUri: "https://example.com" };

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.fetchPage.mockReset();
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Places checks", () => {
  it("skips Places completely when the feature is disabled", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    expect(await placesChecks(reportId, input, input.url, "")).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("honors the database limit without calling Google", async () => {
    mocks.rpc.mockResolvedValue({ limited: true });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const checks = await placesChecks(reportId, input, input.url, "");
    expect(fetch).not.toHaveBeenCalled();
    expect(checks.every((check) => check.status === "unknown")).toBe(true);
  });

  it("uses only the specified field mask, records calls, and compares actual details", async () => {
    mocks.rpc.mockResolvedValueOnce({ call_id: callId }).mockResolvedValueOnce(null);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [place] })));
    vi.stubGlobal("fetch", fetch);
    const checks = await placesChecks(reportId, input, input.url, "Call 512-555-0123 at 1 Main St Austin");
    const options = fetch.mock.calls[0][1];
    expect(options.headers["X-Goog-FieldMask"]).toBe(PLACES_FIELD_MASK);
    expect(PLACES_FIELD_MASK.split(",")).toEqual([
      "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber", "places.rating",
      "places.userRatingCount", "places.websiteUri", "places.googleMapsUri",
    ]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("grader_places_finish", expect.objectContaining({ p_status: "ok", p_call_id: callId }));
    expect(checks.find((check) => check.id === "places_phone")?.status).toBe("pass");
    expect(checks.find((check) => check.id === "places_address")?.status).toBe("pass");
  });

  it("treats a billing/quota response as unknown and records it", async () => {
    mocks.rpc.mockResolvedValueOnce({ call_id: callId }).mockResolvedValueOnce(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    const checks = await placesChecks(reportId, input, input.url, "");
    expect(checks.every((check) => check.status === "unknown")).toBe(true);
    expect(mocks.rpc).toHaveBeenLastCalledWith("grader_places_finish", expect.objectContaining({ p_status: "quota" }));
  });

  it("uses cached data, including for a usable Maps link, without a Google call", async () => {
    mocks.rpc.mockResolvedValue({ cached: { places: [place] } });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const checks = await placesChecks(reportId, {
      url: input.url, googleMapsUrl: "https://www.google.com/maps/place/Joe+Plumbing",
    }, input.url, "");
    expect(fetch).not.toHaveBeenCalled();
    expect(checks.find((check) => check.id === "places_rating")?.value).toBe(4.7);
  });

  it("does not attribute an unrelated Google business to the site", async () => {
    mocks.rpc.mockResolvedValue({ cached: { places: [{ ...place, displayName: { text: "Other Business" } }] } });
    const checks = await placesChecks(reportId, input, input.url, "");
    expect(checks.every((check) => check.status === "unknown")).toBe(true);
  });

  it("resolves a Google Maps short link through the safe fetcher", async () => {
    mocks.fetchPage.mockResolvedValue({ url: "https://www.google.com/maps/place/Joe+Plumbing" });
    mocks.rpc.mockResolvedValue({ cached: { places: [place] } });
    const checks = await placesChecks(reportId, {
      url: input.url, googleMapsUrl: "https://maps.app.goo.gl/example",
    }, input.url, "");
    expect(mocks.fetchPage).toHaveBeenCalledOnce();
    expect(checks.find((check) => check.id === "places_rating")?.value).toBe(4.7);
  });
});
