import { afterEach, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("reports an invalid analytics salt once at node server startup without logging the secret", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  for (const salt of ["", "a".repeat(31)]) {
    vi.stubEnv("ANALYTICS_HASH_SALT", salt);
    register();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("Analytics is unavailable: ANALYTICS_HASH_SALT must be at least 32 characters.");
    error.mockClear();
  }
  vi.stubEnv("ANALYTICS_HASH_SALT", "a".repeat(32));
  register();
  expect(error).not.toHaveBeenCalled();
});
