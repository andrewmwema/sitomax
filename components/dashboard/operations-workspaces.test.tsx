// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientDirectory, type ClientAccount } from "./client-directory";
import { ClientDetails } from "./client-details";
import { DomainRequestsWorkspace, type ManagedDomainRequest } from "./domain-requests-workspace";
import { SubmissionDetails } from "./submission-details";

vi.mock("@/app/(dashboard)/dashboard/clients/actions", () => ({ inviteOwner: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/domain-requests/actions", () => ({ updateDomainRequest: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/forms/actions", () => ({ markSubmissionRead: vi.fn() }));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

function changeControl(control: HTMLInputElement | HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(control.constructor.prototype, "value")?.set?.call(control, value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

const client: ClientAccount = {
  id: "client", name: "North Studio", created_at: "2026-11-01T10:00:00Z",
  sites: [{ id: "site", name: "North Website", subdomain: "north" }],
  account_members: [{ role: "owner", profile: { full_name: "Alex", email: "alex@example.test" } }],
  ai_limits: { monthly_site_generations: 1, monthly_edits: 50, extra_credits: 2 },
};
const request: ManagedDomainRequest = {
  id: "request", site_id: "site", domain: "north.example.com", provider: "cloudflare",
  status: "done", notes: "DNS setup finished", created_at: "2026-11-01T10:00:00Z", done_at: "2026-11-02T10:00:00Z",
  notification_sent_at: null,
  site: { name: "North Website", subdomain: "north", custom_domain: "north.example.com", domain_verified: false, account: { name: "North Studio" } },
};

describe("Phase 3 operations workspaces", () => {
  it("preserves client filters in the detail link and browser history", async () => {
    await act(async () => root.render(<ClientDirectory accounts={[client, { ...client, id: "other", name: "South Studio", account_members: [], sites: [] }]} />));
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => changeControl(search, "alex@example.test"));
    expect(container.querySelector("tbody")?.textContent).toContain("North Studio");
    expect(container.querySelector("tbody")?.textContent).not.toContain("South Studio");
    const tableRegion = container.querySelector<HTMLElement>('[role="region"][aria-label="Client accounts"]');
    expect(tableRegion?.tabIndex).toBe(0);
    tableRegion?.focus();
    expect(document.activeElement).toBe(tableRegion);
    expect(container.querySelector("tbody a")?.getAttribute("href")).toBe("/dashboard/clients?q=alex%40example.test&client=client");
    expect(window.location.search).toBe("?q=alex%40example.test");
    await act(async () => { changeControl(search, ""); changeControl(container.querySelector<HTMLSelectElement>("select")!, "unassigned"); });
    expect(container.querySelector("tbody")?.textContent).toContain("South Studio");
    expect(container.querySelector("tbody")?.textContent).not.toContain("North Studio");
    expect(window.location.search).toBe("?access=unassigned");
    await act(async () => root.render(<ClientDetails account={client} backHref="/dashboard/clients?access=unassigned"
      allowance={{ account_id: client.id, account_name: client.name, site_generations: 0, edits: 0,
        included_generations: 0, included_edits: 0, pending_requests: 0, monthly_site_generations: 5, monthly_edits: 150, extra_credits: 2 }} />));
    expect(container.querySelector('a[href="/dashboard/clients?access=unassigned"]')?.textContent).toContain("Back to clients");
    expect(container.querySelector('a[href="/dashboard/sites/site"]')).not.toBeNull();
    expect(container.querySelector('input[name="accountId"]')?.getAttribute("value")).toBe("client");
    expect(container.textContent).toContain("Site generations / month5");
    expect(container.textContent).toContain("Edits / month150");
    expect(container.textContent).toContain("Acceptance status and invitation history are not currently tracked");
  });

  it("restores client pagination and keeps it in detail links", async () => {
    const accounts = Array.from({ length: 26 }, (_, index) => ({ ...client, id: `client-${index}` }));
    await act(async () => root.render(<ClientDirectory accounts={accounts} initialFilters={{ q: "", access: "owner", page: 2 }} />));
    expect(container.textContent).toContain("Page 2 of 2");
    expect(container.querySelector("tbody a")?.getAttribute("href")).toBe("/dashboard/clients?access=owner&page=2&client=client-25");
    await act(async () => container.querySelector<HTMLButtonElement>('nav[aria-label="Client pagination"] button')!.click());
    expect(window.location.search).toBe("?access=owner");
    expect(container.textContent).toContain("Page 1 of 2");
  });

  it("keeps a completed request separate from domain verification and retains the update workflow", async () => {
    await act(async () => root.render(<DomainRequestsWorkspace requests={[request]} />));
    const row = container.querySelector("tbody tr")!;
    expect(row.closest('[role="region"]')?.getAttribute("aria-label")).toBe("Domain setup requests");
    expect(row.textContent).toContain("Done");
    expect(row.textContent).toContain("Not verified");
    await act(async () => row.querySelector<HTMLButtonElement>("button")!.click());
    const dialog = container.querySelector<HTMLDialogElement>("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain("does not verify DNS or connect the domain");
    expect(dialog.querySelector('a[href="/dashboard/sites/site/domains"]')).not.toBeNull();
    expect(dialog.querySelector("textarea")?.value).toBe("DNS setup finished");
    const status = container.querySelector<HTMLSelectElement>('section[aria-label="Domain request directory"] > div select')!;
    await act(async () => changeControl(status, "requested"));
    expect(container.querySelector("tbody")).toBeNull();
    expect(container.textContent).toContain("No requests match these filters");
  });

  it("keeps request update feedback mounted when a saved status no longer matches the filter", async () => {
    await act(async () => root.render(<DomainRequestsWorkspace requests={[{ ...request, status: "requested" }]} />));
    const status = container.querySelector<HTMLSelectElement>('section[aria-label="Domain request directory"] > div select')!;
    await act(async () => changeControl(status, "requested"));
    await act(async () => container.querySelector<HTMLButtonElement>("tbody button")!.click());
    const form = container.querySelector("dialog form");
    await act(async () => root.render(<DomainRequestsWorkspace requests={[request]} />));
    expect(container.querySelector("tbody")).toBeNull();
    expect(container.querySelector<HTMLDialogElement>("dialog")?.open).toBe(true);
    expect(container.querySelector("dialog form")).toBe(form);
    expect(container.querySelector("dialog")?.textContent).toContain("Completion email has not been sent yet");
  });

  it("does not label a request verified when its site has verified a different domain", async () => {
    await act(async () => root.render(<DomainRequestsWorkspace requests={[{ ...request, site: { ...request.site, domain_verified: true, custom_domain: "different.example.com" } }]} />));
    expect(container.querySelector("tbody tr")?.textContent).toContain("Not verified");
  });

  it("preserves arbitrary submission fields, safely renders content, and reports clipboard errors", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    await act(async () => root.render(<SubmissionDetails siteName="North Website" submission={{
      id: "submission", site_id: "site", form_name: "Custom quote", page_path: "/quote", is_read: false,
      created_at: "2026-11-01T10:00:00Z", data: { "Project notes": "<script>alert(1)</script>", Preferences: { service: ["Roofing"] } },
    }} />));
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    const dialog = container.querySelector<HTMLDialogElement>("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("script")).toBeNull();
    expect(dialog.textContent).toContain("<script>alert(1)</script>");
    expect(dialog.textContent).toContain('{"service":["Roofing"]}');
    expect(dialog.querySelector('input[name="id"]')?.getAttribute("value")).toBe("submission");
    const copy = [...dialog.querySelectorAll("button")].find((button) => button.textContent?.includes("Copy answers"))!;
    await act(async () => copy.click());
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("Could not copy answers");
  });
});
