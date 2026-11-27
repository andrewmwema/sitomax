import { afterEach, describe, expect, it, vi } from "vitest";
import { graderConfigurationChecks, graderUnlockConfigurationIssues } from "./health";

afterEach(() => vi.unstubAllEnvs());

describe("grader configuration health", () => {
  it("matches the unlock gate and never returns configuration values", () => {
    vi.stubEnv("GRADER_LEADS_ACCOUNT_ID", "37cbb241-381b-4bb5-b85d-0bef401d0bd9");
    vi.stubEnv("GRADER_LEADS_SITE_ID", "c69087f8-4538-4d40-8905-51f36403ec48");
    vi.stubEnv("GRADER_NOTIFICATION_EMAIL", " notify@example.com ");
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "private-test-token");
    vi.stubEnv("POSTMARK_FROM_EMAIL", "sender@example.com");
    expect(graderUnlockConfigurationIssues()).toEqual([]);
    expect(JSON.stringify(graderConfigurationChecks())).not.toContain("private-test-token");
    vi.stubEnv("GRADER_LEADS_SITE_ID", "not-a-uuid");
    vi.stubEnv("POSTMARK_FROM_EMAIL", "  ");
    expect(graderUnlockConfigurationIssues()).toEqual(["GRADER_LEADS_SITE_ID missing or invalid UUID", "POSTMARK_FROM_EMAIL missing"]);
  });

  it("marks invalid CTA and short follow-up secret as unhealthy, and honors the default transactional stream", () => {
    vi.stubEnv("NEXT_PUBLIC_GRADER_CTA_URL", "http://example.com");
    vi.stubEnv("GRADER_UNSUBSCRIBE_SECRET", "short");
    vi.stubEnv("POSTMARK_MESSAGE_STREAM", "");
    const checks = graderConfigurationChecks();
    expect(checks.find((check) => check.name === "NEXT_PUBLIC_GRADER_CTA_URL")?.ok).toBe(false);
    expect(checks.find((check) => check.name === "GRADER_UNSUBSCRIBE_SECRET")?.ok).toBe(false);
    expect(checks.find((check) => check.name === "POSTMARK_MESSAGE_STREAM")).toMatchObject({ ok: true, detail: expect.stringContaining("outbound") });
  });
});
