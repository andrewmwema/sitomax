import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), siteDomains: vi.fn(), admin: false, owners: ["own"] }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.authorize }));
vi.mock("../sites/[siteId]/domains/page", () => ({
  default: async ({ params }: { params: Promise<{ siteId: string }> }) => {
    const { siteId } = await params;
    mocks.siteDomains(siteId);
    return <p>Domain settings for {siteId}</p>;
  },
}));
import DomainsPage from "./page";

const sites = [
  { id: "site-one", account_id: "own", name: "First website", subdomain: "first", custom_domain: "example.com", domain_verified: true },
  { id: "site-two", account_id: "second", name: "Second website", subdomain: "second", custom_domain: null, domain_verified: false },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin = false;
  mocks.owners = ["own"];
  mocks.authorize.mockResolvedValue({
    user: { id: "user" },
    supabase: {
      from: (table: string) => table === "sites"
        ? { select: () => ({ order: async () => ({ data: sites, error: null }) }) }
        : { select: () => ({ eq: () => ({ eq: async () => ({ data: mocks.owners.map((account_id) => ({ account_id })), error: null }) }) }) },
      rpc: async () => ({ data: mocks.admin, error: null }),
    },
  });
});

async function renderPage() {
  const errors: unknown[] = [];
  const stream = await renderToReadableStream(<DomainsPage />, { onError: (error) => { errors.push(error); } });
  await stream.allReady;
  const html = await new Response(stream).text();
  if (errors.length) throw errors[0];
  return html;
}

describe("workspace domains", () => {
  it("opens settings directly when the user can manage one site", async () => {
    const html = await renderPage();
    expect(html).toContain("Domain settings for");
    expect(html).toContain("site-one");
    expect(mocks.siteDomains).toHaveBeenCalledWith("site-one");
    expect(html).not.toContain("Second website");
  });

  it("lists only manageable sites when multiple are available", async () => {
    mocks.owners = ["own", "second"];
    const html = await renderPage();
    expect(html).toContain("First website");
    expect(html).toContain("example.com");
    expect(html).toContain("Connected");
    expect(html).toContain("Second website");
    expect(html).toContain("/dashboard/sites/site-two/domains");
    expect(mocks.siteDomains).not.toHaveBeenCalled();
  });

  it("shows a clear empty state for editors", async () => {
    mocks.owners = [];
    const html = await renderPage();
    expect(html).toContain("Domain management is available to account owners");
    expect(html).not.toContain("First website");
    expect(mocks.siteDomains).not.toHaveBeenCalled();
  });

  it("allows agency administrators to select sites across accounts", async () => {
    mocks.owners = [];
    mocks.admin = true;
    const html = await renderPage();
    expect(html).toContain("First website");
    expect(html).toContain("Second website");
  });
});
