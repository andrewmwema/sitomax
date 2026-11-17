// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { SiteGrid } from "./site-grid";

describe("dashboard site filters", () => {
  it("filters by published homepage without hiding pages or edit links", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const base = { custom_domain: null, domain_verified: false, accountName: null, placeholderCount: 0 };
    await act(async () => root.render(<SiteGrid sites={[
      { ...base, id: "1", subdomain: "live", name: "Live site", pages: [{ id: "p1", slug: "", published_at: "2026-01-01" }] },
      { ...base, id: "2", subdomain: "draft", name: "Draft site", pages: [{ id: "p2", slug: "", published_at: null }] },
    ]} />));
    const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
    await act(async () => button("Live").click());
    expect(container.textContent).toContain("Live site");
    expect(container.textContent).not.toContain("Draft site");
    expect(container.querySelector('a[href="/editor/p1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/dashboard/sites/1"]')).not.toBeNull();
    await act(async () => button("Drafts").click());
    expect(container.textContent).toContain("Draft site");
    expect(button("Drafts").getAttribute("aria-pressed")).toBe("true");
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });
});
