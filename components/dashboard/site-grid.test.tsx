// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { SiteGrid } from "./site-grid";

function changeControlValue(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value")?.set;
  setter?.call(control, value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

describe("dashboard site filters", () => {
  it("filters by published homepage without hiding pages or edit links", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const base = { custom_domain: null, domain_verified: false, accountName: null, placeholderCount: 0, canManageDomains: false };
    await act(async () => root.render(<SiteGrid marketingSubdomain="sitomax" sites={[
      { ...base, id: "1", subdomain: "live", name: "Live site", canManageDomains: true, pages: [{ id: "p1", slug: "", published_at: "2026-01-01" }] },
      { ...base, id: "2", subdomain: "draft", name: "Draft site", pages: [{ id: "p2", slug: "", published_at: null }] },
    ]} />));
    const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
    await act(async () => button("Live").click());
    expect(container.textContent).toContain("Live site");
    expect(container.textContent).not.toContain("Draft site");
    const edit = container.querySelector<HTMLAnchorElement>('a[href="/editor/p1"]')!;
    expect(edit.target).toBe("_blank");
    expect(edit.rel).toBe("noopener noreferrer");
    const live = container.querySelector<HTMLAnchorElement>('a[target="_blank"]:not([href^="/"])')!;
    expect(live.rel).toBe("noopener noreferrer");
    expect(container.querySelector('a[href="/dashboard/sites/1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/dashboard/sites/1/domains"]')?.textContent?.trim()).toBe("Connect domain");
    await act(async () => button("Drafts").click());
    expect(container.textContent).toContain("Draft site");
    expect(button("Drafts").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('a[href="/dashboard/sites/2/domains"]')).toBeNull();
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });

  it("links to domain management when an authorized site's domain is already attached", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<SiteGrid marketingSubdomain="sitomax" sites={[{
      id: "1", subdomain: "live", name: "Live site", custom_domain: "example.com",
      domain_verified: false, accountName: null, placeholderCount: 0, canManageDomains: true, pages: [],
    }]} />));
    expect(container.querySelector('a[href="/dashboard/sites/1/domains"]')?.textContent?.trim()).toBe("Domains");
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });

  it("searches and filters by client, and persists the list view", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    window.localStorage.removeItem("sitomax-sites-view");
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const base = { custom_domain: null, domain_verified: false, placeholderCount: 0, canManageDomains: true, pages: [{ id: "home", slug: "", published_at: "2026-01-01" }] };
    await act(async () => root.render(<SiteGrid marketingSubdomain="sitomax" sites={[
      { ...base, id: "1", subdomain: "north", name: "North Studio", accountName: "North Client", createdAt: "2026-01-02" },
      { ...base, id: "2", subdomain: "south", name: "South Studio", accountName: "South Client", createdAt: "2026-01-01" },
    ]} />));
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => changeControlValue(search, "north"));
    expect(container.textContent).toContain("North Studio");
    expect(container.textContent).not.toContain("South Studio");
    await act(async () => {
      changeControlValue(search, "");
      container.querySelector<HTMLButtonElement>('[aria-label="List view"]')!.click();
    });
    expect(window.localStorage.getItem("sitomax-sites-view")).toBe("list");
    expect(container.querySelector("table")).not.toBeNull();
    const listEdit = container.querySelector<HTMLAnchorElement>('a[href="/editor/home"]')!;
    expect(listEdit.target).toBe("_blank");
    expect(listEdit.rel).toBe("noopener noreferrer");
    await act(async () => {
      const select = container.querySelector<HTMLSelectElement>('[aria-label="Filter by client"]')!;
      changeControlValue(select, "South Client");
    });
    expect(container.textContent).toContain("South Studio");
    expect(container.textContent).not.toContain("North Studio");
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });
});
