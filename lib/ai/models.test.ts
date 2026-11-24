import { afterEach, describe, expect, it, vi } from "vitest";

describe("AI model configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the default generation model when no override is configured", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "");
    const models = await import("./models");
    expect(models.SITE_GENERATION_MODEL).toBe("claude-sonnet-5-5");
  });

  it("allows switching generation to another model with configured pricing", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-haiku-5-5");
    const [models, pricing] = await Promise.all([import("./models"), import("./pricing")]);
    expect(models.modelForAction("generate_site")).toBe("claude-haiku-5-5");
    expect(() => pricing.assertPricedModel(models.SITE_GENERATION_MODEL)).not.toThrow();
  });

  it("fails closed for model IDs without configured pricing", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-unknown-model");
    await expect(import("./models")).rejects.toThrow("configured AI pricing");
  });
});
