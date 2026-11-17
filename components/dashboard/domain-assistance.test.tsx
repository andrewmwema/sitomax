// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainAssistance } from "./domain-assistance";
import type { DomainAssistanceData } from "@/lib/domains/requests";
const mocks = vi.hoisted(() => ({ submit: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/sites/[siteId]/domains/request-actions", () => ({ createDomainRequest: mocks.submit }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const id = "00000000-0000-4000-8000-000000000001";
const data: DomainAssistanceData = { supportEmail: "support@agency.example", canRequest: true, isSuperAdmin: false,
  requests: [{ id, site_id: id, domain: "example.com", provider: "godaddy", status: "needs_info",
    notes: "Please confirm the invitation was sent.", created_at: "2026-11-17T00:00:00Z" }] };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); document.body.innerHTML = ""; });
async function setup(props = data) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<DomainAssistance siteId={id} domain="example.com" providerId="godaddy" data={props} />));
  return { container, root };
}
const button = (container: HTMLElement, label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label)!;
describe("safe delegated setup", () => {
  it("shows provider-specific least-privilege steps and the agency invite email, without credential fields", async () => {
    const { container, root } = await setup();
    expect(container.textContent).toContain("Needs information");
    expect(container.textContent).toContain("Please confirm the invitation was sent.");
    expect(container.textContent).toContain("We will never ask for your password.");
    await act(async () => button(container, "Have us connect it for you").click());
    expect(container.textContent).toContain("support@agency.example");
    expect(container.textContent).toContain("Delegate Access");
    expect(container.textContent).toContain("Transfer Access off");
    await act(async () => {
      const select = container.querySelector("select")!; select.value = "cloudflare";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Domain DNS");
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect([...container.querySelectorAll("input,textarea")].map((input) => input.getAttribute("name"))).toEqual(["domain", "invited"]);
    await act(async () => button(container, "Refresh request status").click());
    expect(mocks.refresh).toHaveBeenCalled();
    await act(async () => root.unmount());
  });
  it("disables submission without an agency email and lets non-owner admins manage existing requests only", async () => {
    const { container, root } = await setup({ ...data, supportEmail: null });
    await act(async () => button(container, "Have us connect it for you").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("support email");
    expect(button(container, "Request agency setup").disabled).toBe(true);
    await act(async () => root.unmount());
    const admin = await setup({ ...data, canRequest: false, isSuperAdmin: true });
    expect(admin.container.textContent).not.toContain("Have us connect it for you");
    expect(admin.container.querySelector('a[href="/dashboard/domain-requests"]')).not.toBeNull();
    await act(async () => admin.root.unmount());
  });
});
