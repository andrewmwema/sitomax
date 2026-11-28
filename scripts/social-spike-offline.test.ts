import { describe, expect, it } from "vitest";
import { buildOfflineUpload, interpretOfflineStatus } from "./social-spike-offline";

const base = {
  profile: "sample_profile",
  text: "Sample post",
  requestId: "request-1",
  externalId: "post-1",
};

describe("offline social spike", () => {
  it("builds a photo upload with separate platforms, media and destination IDs", () => {
    const upload = buildOfflineUpload({
      ...base,
      platforms: ["facebook", "instagram", "google_business"],
      photos: ["https://example.com/one.jpg", "https://example.com/two.jpg"],
      facebookPageId: "page-1",
      googleLocationId: "locations/123",
    });
    expect(upload.path).toBe("/api/upload_photos");
    expect(upload.form.getAll("platform[]")).toEqual(["facebook", "instagram", "google_business"]);
    expect(upload.form.getAll("photos[]")).toEqual(["https://example.com/one.jpg", "https://example.com/two.jpg"]);
    expect(upload.form.get("async_upload")).toBe("true");
    expect(upload.form.get("request_id")).toBe("request-1");
    expect(upload.form.get("facebook_page_id")).toBe("page-1");
    expect(upload.form.get("gbp_location_id")).toBe("locations/123");
  });

  it("uses text uploads without media and refuses unsupported Instagram text", () => {
    expect(buildOfflineUpload({ ...base, platforms: ["facebook"], photos: [] }).path).toBe("/api/upload_text");
    expect(() => buildOfflineUpload({ ...base, platforms: ["instagram"], photos: [] })).toThrow("Instagram requires media");
    expect(() => buildOfflineUpload({ ...base, platforms: ["facebook"], photos: ["http://example.com/photo.jpg"] })).toThrow();
  });

  it("does not mistake a completed request with a skipped target for complete publication", () => {
    expect(interpretOfflineStatus(["facebook", "instagram", "google_business"], {
      status: "completed",
      results: [
        { platform: "facebook", status: "completed", success: true, post_url: "https://example.com/post" },
        { platform: "instagram", status: "skipped", skipped: true, success: false },
        { platform: "google_business", status: "completed", success: true, post_url: null },
      ],
    })).toEqual([
      { platform: "facebook", state: "provider_succeeded", postUrl: "https://example.com/post" },
      { platform: "instagram", state: "skipped", postUrl: null },
      { platform: "google_business", state: "provider_succeeded", postUrl: null },
    ]);
  });

  it("keeps missing terminal results unknown and preserves retryable results", () => {
    expect(interpretOfflineStatus(["facebook", "instagram"], {
      status: "failed",
      results: [{ platform: "facebook", status: "retryable", success: false }],
    })).toEqual([
      { platform: "facebook", state: "retryable", postUrl: null },
      { platform: "instagram", state: "unknown", postUrl: null },
    ]);
    expect(interpretOfflineStatus(["facebook"], { status: "processing", results: [] })[0].state).toBe("pending");
    expect(interpretOfflineStatus(["facebook"], {
      status: "in_progress",
      results: [{ platform: "facebook", success: true, message: "Queued" }],
    })[0].state).toBe("pending");
  });

  it("rejects malformed or unexpected status data", () => {
    expect(() => interpretOfflineStatus(["facebook"], { status: "new_status", results: [] })).toThrow();
    expect(() => interpretOfflineStatus(["facebook"], {
      status: "completed", results: [{ platform: "instagram", success: true }],
    })).toThrow("unexpected platforms");
  });
});
