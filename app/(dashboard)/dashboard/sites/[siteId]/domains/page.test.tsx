import { renderToReadableStream } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), assistance: vi.fn(), findPage: vi.fn() }));
vi.mock("./actions", () => ({ loadDomainSettings: mocks.load }));
vi.mock("@/lib/domains/request-data", () => ({ loadDomainAssistance: mocks.assistance }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ supabase: { from: () => ({ select: () => ({
    eq: (column: string, value: string) => ({
      eq: (nextColumn: string, nextValue: string) => ({
        maybeSingle: () => mocks.findPage(column, value, nextColumn, nextValue),
      }),
    }),
  }) }) } }),
}));
vi.mock("@/components/dashboard/domain-settings", () => ({ DomainSettings: () => <div>Domain settings</div> }));
vi.mock("@/components/dashboard/site-settings-nav", () => ({ SiteSettingsNav: () => null }));
import DomainsPage from "./page";

const pageId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockResolvedValue({ site: { id: "site", name: "Example", subdomain: "example" } });
  mocks.assistance.mockResolvedValue({});
});

async function renderPage(editorPage?: string) {
  const errors: unknown[] = [];
  const stream = await renderToReadableStream(
    <DomainsPage params={Promise.resolve({ siteId: "site" })} searchParams={Promise.resolve({ editorPage })} />,
    { onError: (error) => { errors.push(error); } },
  );
  await stream.allReady;
  const html = await new Response(stream).text();
  if (errors.length) throw errors[0];
  return html;
}

it("links back only to a page belonging to the current site", async () => {
  mocks.findPage.mockResolvedValueOnce({ data: { id: pageId }, error: null });
  expect(await renderPage(pageId)).toContain(`href="/editor/${pageId}"`);
  expect(mocks.findPage).toHaveBeenCalledWith("site_id", "site", "id", pageId);
  mocks.findPage.mockResolvedValueOnce({ data: null, error: null });
  expect(await renderPage(pageId)).not.toContain("Back to editor");
  expect(await renderPage("invalid")).not.toContain("Back to editor");
  expect(mocks.findPage).toHaveBeenCalledTimes(2);
});
