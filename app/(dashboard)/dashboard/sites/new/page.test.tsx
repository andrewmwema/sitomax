import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ accounts: vi.fn(), instantiate: vi.fn() }));
vi.mock("@/lib/accounts", () => ({ getSiteAccountOptions: mocks.accounts }));
vi.mock("@/templates/instantiate", () => ({ instantiateTemplate: mocks.instantiate }));
vi.mock("@/templates", () => ({ templates: { plumber: { key: "plumber", name: "Plumber", theme: {} } } }));
vi.mock("@/components/dashboard/new-site-wizard", () => ({ NewSiteWizard: () => <div data-testid="template-wizard" /> }));
import NewSitePage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.accounts.mockResolvedValue([{ id: "agency", name: "Agency", is_internal: true }]);
  mocks.instantiate.mockReturnValue([{ data: { content: [{ type: "Hero", props: {} }] } }]);
});
describe("New site entry", () => {
  it("offers AI and template paths before loading a template wizard or preparing its previews", async () => {
    const markup = renderToStaticMarkup(await NewSitePage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain('href="/dashboard/sites/new/ai"');
    expect(markup).toContain('href="/dashboard/sites/new?method=template"');
    expect(markup).not.toContain('data-testid="template-wizard"');
    expect(mocks.instantiate).not.toHaveBeenCalled();
  });
  it("opens the template wizard only when that creation path is selected", async () => {
    const markup = renderToStaticMarkup(await NewSitePage({ searchParams: Promise.resolve({ method: "template" }) }));
    expect(markup).toContain('data-testid="template-wizard"');
    expect(mocks.instantiate).toHaveBeenCalledOnce();
  });
});
