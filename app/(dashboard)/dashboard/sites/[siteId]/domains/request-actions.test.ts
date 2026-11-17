import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ site: vi.fn(), agency: vi.fn(), owner: vi.fn(), insert: vi.fn(), saved: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { id: "owner-id" }, supabase: {
  rpc: mocks.owner,
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: table === "agency_settings" ? mocks.agency : mocks.site }) }),
    insert: mocks.insert,
  }),
} }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { createDomainRequest } from "./request-actions";
const site = "00000000-0000-4000-8000-000000000001";
const initial = { error: "", success: "" };
function form() {
  const form = new FormData();
  form.set("domain", "HTTPS://WWW.Example.COM/"); form.set("provider", "godaddy"); form.set("invited", "on");
  return form;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.site.mockResolvedValue({ data: { account_id: site }, error: null });
  mocks.agency.mockResolvedValue({ data: { support_email: "support@agency.example" }, error: null });
  mocks.owner.mockResolvedValue({ data: true, error: null });
  mocks.insert.mockReturnValue({ select: () => ({ maybeSingle: mocks.saved }) });
  mocks.saved.mockResolvedValue({ data: { id: site }, error: null });
});
describe("owner domain setup requests", () => {
  it("saves only the validated request and authenticated creator, not credentials or client status fields", async () => {
    const data = form(); data.set("password", "do-not-store"); data.set("status", "done"); data.set("notes", "do-not-store");
    data.set("created_by", "someone-else");
    expect((await createDomainRequest(site, initial, data)).error).toBe("");
    expect(mocks.insert).toHaveBeenCalledWith({
      site_id: site, domain: "example.com", provider: "godaddy", created_by: "owner-id",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/sites/${site}/domains`);
  });
  it("denies editors, unrelated accounts and failed permission lookups before creating requests", async () => {
    mocks.owner.mockResolvedValueOnce({ data: false, error: null });
    expect((await createDomainRequest(site, initial, form())).error).toContain("Only account owners");
    mocks.site.mockResolvedValueOnce({ data: null, error: null });
    expect((await createDomainRequest(site, initial, form())).error).toContain("access");
    mocks.owner.mockResolvedValueOnce({ data: true, error: { message: "Failed" } });
    expect((await createDomainRequest(site, initial, form())).error).toContain("Only account owners");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("requires a real agency invitation address, valid domain/provider and invite confirmation", async () => {
    const invalid = form(); invalid.set("domain", "example.com/path");
    expect((await createDomainRequest(site, initial, invalid)).error).toBeTruthy();
    invalid.set("domain", "example.com"); invalid.set("provider", "invalid");
    expect((await createDomainRequest(site, initial, invalid)).error).toBeTruthy();
    invalid.set("provider", "godaddy"); invalid.delete("invited");
    expect((await createDomainRequest(site, initial, invalid)).error).toBeTruthy();
    mocks.agency.mockResolvedValue({ data: { support_email: null }, error: null });
    expect((await createDomainRequest(site, initial, form())).error).toContain("support email");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("surfaces the database's duplicate-open-request guard", async () => {
    mocks.saved.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect((await createDomainRequest(site, initial, form())).error).toContain("open request already exists");
  });
});
