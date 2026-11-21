import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), admin: vi.fn(), accounts: [] as unknown[] }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: mocks.admin }));
vi.mock("@/app/(dashboard)/dashboard/clients/actions", () => ({ createAccount: vi.fn(), inviteOwner: vi.fn() }));
import ClientsPage from "./page";

const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.accounts = [{ id, name: "Example client", created_at: "2026-11-01T10:00:00Z", account_members: [], sites: [], ai_limits: null }];
  mocks.from.mockImplementation(() => {
    const query = { select: () => query, eq: () => query, order: () => query, range: async () => ({ data: mocks.accounts, error: null }) };
    return query;
  });
  mocks.admin.mockResolvedValue({ supabase: { from: mocks.from } });
});

async function render(params: Record<string, string>) {
  const errors: unknown[] = [];
  const stream = await renderToReadableStream(<ClientsPage params={Promise.resolve({})} searchParams={Promise.resolve(params)} />, {
    onError: (error) => { errors.push(error); },
  });
  await stream.allReady;
  const html = await new Response(stream).text();
  if (errors.length) throw errors[0];
  return html;
}

describe("client detail navigation", () => {
  it("requires agency access and opens a client with a filtered return link", async () => {
    const html = await render({ client: id, q: "Example", access: "unassigned", page: "2" });
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(html).toContain('href="/dashboard/clients?q=Example&amp;access=unassigned&amp;page=2"');
    expect(html).toContain("Example client");
    expect(html).toContain("Invite an account owner");
    expect(html).not.toContain('aria-label="Client directory"');
  });

  it("offers a return link for an unavailable client", async () => {
    mocks.accounts = [];
    const html = await render({ client: id, access: "owner" });
    expect(html).toContain('href="/dashboard/clients?access=owner"');
    expect(html).toContain("That client is unavailable");
  });
});
