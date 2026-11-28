import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSocialProvider, SocialProviderError } from "./provider";
import { decryptProfileId, encryptProfileId } from "./encryption";

const requestId = "70000000-0000-4000-8000-000000000001";
const fetchMock = vi.fn<typeof fetch>();
const log = vi.fn().mockResolvedValue(undefined);
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const provider = () => getSocialProvider(log);
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("UPLOAD_POST_API_KEY", "fixture-provider-secret");
  vi.stubEnv("SOCIAL_PROFILE_ENCRYPTION_KEY", "ab".repeat(32));
  fetchMock.mockReset(); log.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("social provider contracts", () => {
  it("creates a profile and sends branded connect fields with tokens redacted", async () => {
    fetchMock.mockResolvedValueOnce(response({ success: true, profile: { username: "test", social_accounts: {} } }, 201));
    expect((await provider().createProfile("test")).data.providerProfileId).toBe("test");
    fetchMock.mockResolvedValueOnce(response({
      success: true, duration: "48h", access_url: "https://app.upload-post.com/connect?token=private",
    }));
    const result = await provider().getConnectUrl("test", {
      logoUrl: "https://example.test/logo.png", redirectUrl: "https://app.example.test/social/connected",
      title: "SitoMax", description: "Connect your social accounts to SitoMax",
      platforms: ["facebook", "instagram", "google_business", "linkedin"],
    });
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.upload-post.com/api/uploadposts/users/generate-jwt");
    expect(options).toMatchObject({
      method: "POST", cache: "no-store", redirect: "error", signal: expect.any(AbortSignal),
      headers: { Authorization: "Apikey fixture-provider-secret", "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      username: "test", logo_image: "https://example.test/logo.png",
      redirect_url: "https://app.example.test/social/connected", connect_title: "SitoMax",
      connect_description: "Connect your social accounts to SitoMax",
      platforms: ["facebook", "instagram", "google_business", "linkedin"], show_calendar: false,
    });
    expect(result.data.url).toContain("token=private");
    expect(result.raw).toMatchObject({ access_url: "[redacted]" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    expect(JSON.stringify(log.mock.calls)).not.toContain("fixture-provider-secret");
  });

  it("normalizes disconnected placeholders and expired connected accounts", async () => {
    fetchMock.mockResolvedValue(response({ success: true, profile: {
      username: "test", social_accounts: {
        instagram: "", linkedin: null, google_business: {
          username: "123", display_name: "Shop", reauth_required: true,
        }, facebook: { username: "321", display_name: "Page", social_images: "javascript:alert(1)" },
      },
    } }));
    expect((await provider().listConnectedAccounts("test")).data).toEqual([
      { platform: "facebook", displayName: "Page", avatarUrl: null, status: "connected" },
      { platform: "google_business", displayName: "Shop", avatarUrl: null, status: "needs_reconnect" },
    ]);
  });

  it("builds asynchronous photo requests with stable retry keys and per-platform titles", async () => {
    fetchMock.mockResolvedValue(response({ request_id: requestId }, 202));
    const result = await provider().publish("test", {
      platforms: ["facebook", "instagram", "google_business", "linkedin"], text: "Hello",
      photoUrl: "https://example.test/photo.jpg", facebookPageId: "123", googleLocationId: "locations/456",
      linkedinPageId: "789", requestId, perPlatformText: { instagram: "Photo caption" },
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.upload-post.com/api/upload_photos");
    const form = options?.body as FormData;
    expect(form.getAll("platform[]")).toEqual(["facebook", "instagram", "google_business", "linkedin"]);
    expect(form.getAll("photos[]")).toEqual(["https://example.test/photo.jpg"]);
    expect(form.get("instagram_title")).toBe("Photo caption");
    expect(form.get("target_linkedin_page_id")).toBe("789");
    expect(form.get("request_id")).toBe(requestId);
    expect(form.get("async_upload")).toBe("true");
    expect(options?.headers).toMatchObject({ "Idempotency-Key": requestId });
    expect(result.data.reference).toEqual({ kind: "request", id: requestId });
  });

  it("rejects Instagram without media, LinkedIn without a company and oversized replies before fetching", async () => {
    await expect(provider().publish("test", { platforms: ["instagram"], text: "Hi", requestId })).rejects.toThrow("requires a photo");
    await expect(provider().publish("test", { platforms: ["linkedin"], text: "Hi", requestId })).rejects.toThrow("company Page");
    await expect(provider().replyToGoogleReview("test", "accounts/1/locations/2/reviews/abc", "😀".repeat(1025))).rejects.toThrow("4096");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not mark queued, missing or skipped targets as published", async () => {
    fetchMock.mockResolvedValueOnce(response({ status: "in_progress", results: [{ platform: "facebook", success: true, message: "Queued" }] }));
    expect((await provider().getStatus({ kind: "request", id: requestId }, ["facebook"])).data[0].status).toBe("pending");
    fetchMock.mockResolvedValueOnce(response({ status: "completed", results: [
      { platform: "facebook", success: true, status: "completed", post_url: "https://facebook.com/post" },
      { platform: "instagram", skipped: true, success: false },
    ] }));
    expect((await provider().getStatus({ kind: "request", id: requestId }, ["facebook", "instagram", "google_business"])).data).toEqual([
      { platform: "facebook", status: "provider_succeeded", url: "https://facebook.com/post", error: null },
      { platform: "instagram", status: "skipped", url: null, error: null },
      { platform: "google_business", status: "unknown", url: null, error: null },
    ]);
  });

  it("lists reviews with cursors and replies using PUT and the full resource name", async () => {
    fetchMock.mockResolvedValueOnce(response({ success: true, reviews: [{
      name: "accounts/1/locations/2/reviews/abc", starRating: "FIVE", reviewer: { displayName: "Example" },
    }], nextPageToken: "page-two" }));
    const listed = await provider().listGoogleReviews("test", { pageToken: "page-one", locationId: "locations/2" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("pageToken=page-one");
    expect(listed.data.nextPageToken).toBe("page-two");
    expect(listed.data.reviews[0]).toMatchObject({ id: "accounts/1/locations/2/reviews/abc", comment: null });
    fetchMock.mockResolvedValueOnce(response({ success: true }));
    await provider().replyToGoogleReview("test", listed.data.reviews[0].id, "Thank you!");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      user: "test", review_name: "accounts/1/locations/2/reviews/abc", comment: "Thank you!",
    });

  });

  it("reports destination lookup failures separately without hiding successful results", async () => {
    fetchMock.mockImplementation(async (url) => String(url).includes("/facebook/")
      ? response({ error_code: "google_business_reconnect_required" }, 401)
      : response({ success: true, locations: [{ name: "locations/123" }] }));
    const result = await provider().listDestinations("test");
    expect(result.data).toMatchObject({
      facebook: { ok: false }, google: { ok: true, response: { locations: [{ name: "locations/123" }] } },
    });
  });

  it.each([
    [401, {}, "auth_expired"], [429, {}, "rate_limited"], [400, { error_code: "INVALID_MEDIA_URL" }, "media_invalid"],
    [504, { error_code: "reply_outcome_unknown" }, "outcome_unknown"],
    [403, { error_code: "PROFILE_LIMIT_REACHED" }, "profile_limit"],
  ])("maps HTTP %s errors and records only bounded audit metadata", async (status, body, code) => {
    fetchMock.mockResolvedValue(response({ ...body, error: "fixture-provider-secret", access_token: "do-not-show" }, status));
    try { await provider().listConnectedAccounts("test"); throw new Error("Expected provider error"); }
    catch (error) {
      expect(error).toBeInstanceOf(SocialProviderError);
      expect(error).toMatchObject({ code, raw: { error: "[redacted]", access_token: "[redacted]" } });
    }
    expect(log).toHaveBeenLastCalledWith({ action: "list_accounts", ok: false, httpStatus: status, errorCode: code });
  });

  it("does not retry unknown write outcomes and exposes the retained request ID to callers", async () => {
    fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expect(provider().publish("test", { platforms: ["facebook"], text: "Hi", requestId }))
      .rejects.toMatchObject({ code: "outcome_unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1]?.body as FormData).get("request_id")).toBe(requestId);
  });

  it("rejects malformed success bodies and unexpected connect origins", async () => {
    fetchMock.mockResolvedValueOnce(response({ success: true }));
    await expect(provider().listConnectedAccounts("test")).rejects.toMatchObject({ code: "invalid_response" });
    fetchMock.mockResolvedValueOnce(response({ success: true, duration: "48h", access_url: "https://evil.test/connect" }));
    await expect(provider().getConnectUrl("test", {
      logoUrl: "https://example.test/logo.png", redirectUrl: "https://app.example.test/social/connected",
      title: "Connect", platforms: ["facebook"],
    })).rejects.toMatchObject({ code: "invalid_response" });
    expect(log).toHaveBeenLastCalledWith({ action: "connect_url", ok: false, httpStatus: 200, errorCode: "invalid_response" });
  });

  it("fails closed when the key is missing or audit persistence fails", async () => {
    vi.stubEnv("UPLOAD_POST_API_KEY", "");
    await expect(provider().listConnectedAccounts("test")).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("UPLOAD_POST_API_KEY", "fixture-provider-secret");
    fetchMock.mockResolvedValue(response({ success: true, profile: { username: "test", social_accounts: {} } }));
    log.mockRejectedValueOnce(new Error("Audit record could not be saved"));
    await expect(provider().listConnectedAccounts("test")).rejects.toThrow("Audit record could not be saved");
  });
});

describe("encrypted provider mappings", () => {
  it("binds ciphertext to its tenant and profile and detects tampering or key changes", () => {
    const encrypted = encryptProfileId("provider-profile", "account:profile");
    expect(encrypted).not.toContain("provider-profile");
    expect(decryptProfileId(encrypted, "account:profile")).toBe("provider-profile");
    expect(() => decryptProfileId(encrypted, "other-account:profile")).toThrow();
    const tampered = `${encrypted.slice(0, -2)}${encrypted.endsWith("ff") ? "00" : "ff"}`;
    expect(() => decryptProfileId(tampered, "account:profile")).toThrow();
    vi.stubEnv("SOCIAL_PROFILE_ENCRYPTION_KEY", "cd".repeat(32));
    expect(() => decryptProfileId(encrypted, "account:profile")).toThrow();
  });
});
