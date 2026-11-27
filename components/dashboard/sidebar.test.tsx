// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/leads" }));

const props = {
  agencyName: "Example Agency", logoUrl: null, isSuperAdmin: false,
  userEmail: "member@example.test", userName: "Member", unreadCount: 2,
  signOutAction: async () => {},
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("dashboard navigation", () => {
  it("uses the uploaded wordmark instead of duplicate brand text in expanded, collapsed, and mobile navigation", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Sidebar {...props} logoUrl="/agency-wordmark.svg" />));
    const sidebar = container.querySelector("aside")!;
    expect(sidebar.querySelector("img")?.alt).toBe(props.agencyName);
    expect(sidebar.querySelector("strong")).toBeNull();
    expect(sidebar.textContent).toContain("Client workspace");
    await act(async () => sidebar.querySelector<HTMLButtonElement>('[aria-label="Collapse sidebar"]')!.click());
    expect(sidebar.querySelector("img")?.alt).toBe(props.agencyName);
    expect(sidebar.textContent).not.toContain("Client workspace");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')!.click());
    const drawer = container.querySelector<HTMLDialogElement>('[aria-label="Workspace navigation"]')!;
    expect(drawer.querySelector("img")?.alt).toBe(props.agencyName);
    expect(drawer.querySelector("strong")).toBeNull();
    await act(async () => drawer.querySelector<HTMLButtonElement>('[aria-label="Close navigation"]')!.click());
    expect(drawer.open).toBe(false);
    await act(async () => root.unmount()); container.remove();
  });

  it("preserves role-aware links and unread status while collapsing the desktop sidebar", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Sidebar {...props} />));
    const sidebar = container.querySelector("aside")!;
    expect(sidebar.querySelector('a[href="/dashboard/leads"]')?.getAttribute("aria-current")).toBe("page");
    expect(sidebar.querySelector('a[href="/dashboard/domains"]')?.textContent).toContain("Domains");
    expect(sidebar.querySelector('[aria-label="2 unread leads"]')).not.toBeNull();
    expect(sidebar.querySelector('a[href="/dashboard/clients"]')).toBeNull();
    expect(sidebar.querySelector('a[href="/dashboard/ai-usage"]')).toBeNull();
    expect(sidebar.querySelector('a[href="/dashboard/admin/grader"]')).toBeNull();
    await act(async () => sidebar.querySelector<HTMLButtonElement>('[aria-label="Collapse sidebar"]')!.click());
    expect(sidebar.querySelector('[aria-label="Expand sidebar"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(sidebar.querySelector('a[aria-label="Leads, 2 unread leads"] .platform-nav-count')).not.toBeNull();
    await act(async () => sidebar.querySelector<HTMLButtonElement>('[aria-label="Expand sidebar"]')!.click());
    expect(sidebar.textContent).toContain("Operations");
    await act(async () => root.unmount()); container.remove();
  });

  it("opens the mobile drawer, closes it for navigation, and searches only authorized links", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Sidebar {...props} />));
    const drawer = container.querySelector<HTMLDialogElement>('[aria-label="Workspace navigation"]')!;
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')!.click());
    expect(drawer.open).toBe(true);
    const opener = container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')!;
    expect(opener.querySelector('[aria-label="2 unread leads"]')).not.toBeNull();
    expect(opener.getAttribute("aria-controls")).toBe(drawer.id);
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    const forms = drawer.querySelector<HTMLAnchorElement>('a[href="/dashboard/leads"]')!;
    forms.addEventListener("click", (event) => event.preventDefault());
    await act(async () => forms.click());
    expect(drawer.open).toBe(false);
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')!.click());
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(drawer.open).toBe(true);
    vi.stubGlobal("innerWidth", 1280);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(drawer.open).toBe(false);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })));
    const search = container.querySelector<HTMLDialogElement>('[aria-label="Search navigation"]')!;
    expect(search.open).toBe(true);
    expect(search.querySelector('a[href="/dashboard/clients"]')).toBeNull();
    expect(search.querySelector('a[href="/dashboard/ai-usage"]')).toBeNull();
    expect(search.querySelector('a[href="/dashboard/domains"]')).not.toBeNull();
    const input = search.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "unmatched");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(search.textContent).toContain("No matching pages");
    await act(async () => search.close());
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })));
    expect(search.querySelector("input")?.value).toBe("");
    await act(async () => search.querySelector<HTMLButtonElement>("button")!.click());
    expect(search.open).toBe(false);
    await act(async () => root.unmount()); container.remove();
  });

  it("keeps agency management navigation available to super admins", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Sidebar {...props} isSuperAdmin />));
    const sidebar = container.querySelector("aside")!;
    expect(sidebar.querySelector('a[href="/dashboard/clients"]')).not.toBeNull();
    expect(sidebar.querySelector('a[href="/dashboard/domain-requests"]')).not.toBeNull();
    expect(sidebar.querySelector('a[href="/dashboard/ai-usage"]')).not.toBeNull();
    expect(sidebar.querySelector('a[href="/dashboard/admin/grader"]')).not.toBeNull();
    expect(sidebar.querySelector('a[href="/dashboard/sites"] svg')?.classList.contains("text-sky-700")).toBe(true);
    expect(sidebar.querySelector('a[href="/dashboard/leads"] svg')?.classList.contains("text-rose-700")).toBe(true);
    expect(sidebar.querySelector('a[href="/dashboard/leads"]')?.getAttribute("aria-current")).toBe("page");
    await act(async () => root.unmount()); container.remove();
  });

  it("does not steal Ctrl+K already handled by the reply editor", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Sidebar {...props} />));
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true });
    event.preventDefault();
    await act(async () => window.dispatchEvent(event));
    expect(container.querySelector<HTMLDialogElement>('[aria-label="Search navigation"]')?.open).toBe(false);
    await act(async () => root.unmount()); container.remove();
  });
});
