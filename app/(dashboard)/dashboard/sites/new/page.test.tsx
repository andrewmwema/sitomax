import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ accounts: vi.fn(), gallery: vi.fn() }));
vi.mock("@/lib/accounts", () => ({ getSiteAccountOptions: mocks.accounts }));
vi.mock("@/lib/templates/catalog", () => ({ getPremiumTemplateGalleryOptions: mocks.gallery }));
vi.mock("@/components/dashboard/premium-template-gallery", () => ({ PremiumTemplateGallery: () => <div data-testid="premium-template-gallery" /> }));
import NewSitePage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.accounts.mockResolvedValue([{ id: "agency", name: "Agency", is_internal: true }]);
  mocks.gallery.mockResolvedValue({ isSuperAdmin: false, accounts: [], templates: [] });
});
describe("New site entry", () => {
  it("offers the AI and premium design paths from the admin creation page", async () => {
    const markup = renderToStaticMarkup(await NewSitePage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain('href="/dashboard/sites/new/ai"');
    expect(markup).toContain('href="/dashboard/sites/new?method=template"');
    expect(markup).not.toContain('data-testid="premium-template-gallery"');
    expect(mocks.gallery).not.toHaveBeenCalled();
  });
  it("opens the persisted premium design gallery when the template path is selected", async () => {
    const markup = renderToStaticMarkup(await NewSitePage({ searchParams: Promise.resolve({ method: "template" }) }));
    expect(markup).toContain('data-testid="premium-template-gallery"');
    expect(mocks.gallery).toHaveBeenCalledOnce();
    expect(mocks.accounts).not.toHaveBeenCalled();
  });
});
