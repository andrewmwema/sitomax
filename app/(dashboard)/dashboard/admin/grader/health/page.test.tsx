import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), config: vi.fn(), database: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: mocks.auth }));
vi.mock("@/lib/grader/health", () => ({ graderConfigurationChecks: mocks.config }));
vi.mock("@/lib/grader/health-database", () => ({ graderDatabaseChecks: mocks.database }));
import GraderHealthPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ supabase: {} });
  mocks.config.mockReturnValue([{ name: "TOKEN", ok: false, detail: "Missing." }]);
  mocks.database.mockResolvedValue([{ name: "Database", ok: true, detail: "Available." }]);
});

it("renders configuration and database status after super-admin authorization", async () => {
  const html = renderToStaticMarkup(await GraderHealthPage());
  expect(mocks.auth).toHaveBeenCalledOnce();
  expect(html).toContain("TOKEN");
  expect(html).toContain("Needs attention");
  expect(html).toContain("Database");
  expect(html).toContain("Pass");
});

it("does not evaluate or reveal checks if authorization fails", async () => {
  mocks.auth.mockRejectedValue(new Error("not authorized"));
  await expect(GraderHealthPage()).rejects.toThrow("not authorized");
  expect(mocks.config).not.toHaveBeenCalled();
  expect(mocks.database).not.toHaveBeenCalled();
});
