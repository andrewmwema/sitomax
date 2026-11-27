import { describe, expect, it } from "vitest";
import { htmlChecks, profileCheck, unknownHtmlChecks } from "./html";

describe("HTML checks", () => {
  it("extracts real metadata, JSON-LD and contact signals without returning markup", () => {
    const checks = htmlChecks(`<!doctype html><html lang="en"><head>
      <title>A plumbing service for every home</title>
      <meta name="viewport" content="width=device-width">
      <meta name="robots" content="noindex">
      <script type="application/ld+json">{"@type":"LocalBusiness"}</script>
      </head><body><h1>Plumbing</h1><img src="/a.png" alt="">
      <a href="tel:1234567890">Call</a><script>alert("bad")</script></body></html>`);
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
    expect(byId.title.value).toBe("A plumbing service for every home");
    expect(byId.viewport.status).toBe("pass");
    expect(byId.indexable.status).toBe("fail");
    expect(byId.structured_data.status).toBe("pass");
    expect(byId.image_alt.value).toBe(100);
    expect(byId.click_to_call.status).toBe("pass");
    expect(JSON.stringify(checks)).not.toContain("<script>");
  });

  it("doesn't score missing HTML or an unanswered profile", () => {
    expect(unknownHtmlChecks().every((check) => check.status === "unknown")).toBe(true);
    expect(profileCheck({ url: "https://example.com" }).status).toBe("unknown");
    expect(profileCheck({ url: "https://example.com", hasGoogleProfile: "yes" }).detail).toContain("not verified");
  });
});
