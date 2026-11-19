// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";
import { defaultHeader, editHeader, headerSchema, HEADER_LAYOUTS } from "@/lib/header";
import { emptyBusiness } from "@/lib/business";

const pageId = "00000000-0000-4000-8000-000000000001";
const props = {
  header: defaultHeader("Example"),
  menu: { links: [{ label: "Home", href: "/" }, { label: "Our work", href: "/work" }], contacts: { ...emptyBusiness, businessName: "Example", phone: "+15551234567" } },
  links: { pages: { [pageId]: "/renamed-page" } }, path: "/work",
};
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn(function(this: HTMLDialogElement) {
    this.open = true; this.querySelector<HTMLButtonElement>("button")?.focus();
  }) });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn(function(this: HTMLDialogElement) {
    this.open = false; this.dispatchEvent(new Event("close"));
  }) });
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal"); Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("responsive global header", () => {
  it("server-renders every layout with semantic navigation, active links and skip target", () => {
    for (const { id } of HEADER_LAYOUTS) {
      const html = renderToStaticMarkup(<SiteHeader {...props} header={editHeader(props.header, { device: "desktop", settings: { layout: id } })} />);
      expect(html).toContain(`data-layout="${id}"`);
      expect(html).toContain('href="#site-main-content"');
      expect(html).toContain('aria-label="Primary"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('aria-current="page"');
    }
  });
  it("opens a native modal menu, updates aria-expanded, and restores toggle focus on close", async () => {
    await act(async () => root.render(<SiteHeader {...props} />));
    const view = host.querySelector('[data-header-device="mobile"]')!;
    const toggle = view.querySelector<HTMLButtonElement>("[data-header-toggle]")!;
    const dialog = view.querySelector("dialog")!;
    await act(async () => toggle.click());
    expect(dialog.open).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(dialog.querySelector("button"));
    const focusable = [...dialog.querySelectorAll<HTMLElement>("button, a[href]")];
    focusable.forEach(element => Object.defineProperty(element, "getClientRects", { value: () => [new DOMRect()] }));
    await act(async () => focusable[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(focusable.at(-1));
    await act(async () => focusable.at(-1)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(focusable[0]);
    await act(async () => dialog.querySelector<HTMLButtonElement>("[data-header-close]")!.click());
    expect(dialog.open).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });
  it("renders logo/menu labels as escaped text, never executable markup", () => {
    const header = defaultHeader("<script>alert(1)</script>");
    const html = renderToStaticMarkup(<SiteHeader {...props} header={header} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("hides legacy CTAs to omitted pages, and supports newly selected hamburger layouts", async () => {
    await act(async () => root.render(<SiteHeader {...props} />));
    expect(host.querySelector(".sh-cta")).toBeNull();
    const header = editHeader(props.header, { device: "desktop", settings: { layout: "minimal" } });
    await act(async () => root.render(<SiteHeader {...props} header={header} />));
    const desktop = host.querySelector('[data-header-device="desktop"]')!;
    const toggle = desktop.querySelector<HTMLButtonElement>("[data-header-toggle]")!;
    await act(async () => toggle.click());
    expect(desktop.querySelector("dialog")!.open).toBe(true);
    await act(async () => desktop.querySelector<HTMLButtonElement>("[data-header-close]")!.click());
    expect(desktop.querySelector("dialog")!.open).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
  it("resolves typed links and supports keyboard dropdown entry/Escape", async () => {
    const header = headerSchema.parse({ menu: { source: "custom", items: [{
      label: "Projects", href: { type: "page", pageId }, children: [{ label: "Work", href: "/work" }],
    }] } });
    await act(async () => root.render(<SiteHeader {...props} header={header} />));
    const view = host.querySelector('[data-header-device="desktop"]')!;
    const details = view.querySelector("details")!;
    const summary = details.querySelector("summary")!;
    expect(details.querySelector("a")!.getAttribute("href")).toBe("/renamed-page");
    await act(async () => summary.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(details.querySelector("a"));
    await act(async () => details.querySelector("a")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
});
