// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomainSettingsState } from "@/lib/domains";
import { DomainSettings } from "./domain-settings";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), check: vi.fn(), remove: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/sites/[siteId]/domains/actions", () => ({
  connectSiteDomain: mocks.connect, checkSiteDomain: mocks.check, removeSiteDomain: mocks.remove,
}));
const initial: DomainSettingsState = {
  site: { id: "site", name: "Client", subdomain: "client", custom_domain: "example.com", domain_verified: false },
  connection: { status: "Pending", issue: "Ownership verification is pending.", records: [
    { type: "A", name: "example.com", value: "192.0.2.1" },
    { type: "CNAME", name: "www.example.com", value: "target.example.net" },
    { type: "TXT", name: "_verify.example.com", value: "ownership-token" },
  ] },
  error: "", success: "",
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

describe("domain settings", () => {
  it("shows DNS instructions, copies exact values, checks status and requires removal confirmation", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<DomainSettings siteId="site" initial={initial} />));
    expect(container.textContent).toContain("DNS changes can take up to 48 hours.");
    expect(container.textContent).toContain("ownership-token");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Copy TXT record value"]')!.click());
    expect(copy).toHaveBeenCalledWith("ownership-token");
    const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
    mocks.check.mockResolvedValue({ ...initial, connection: { ...initial.connection!, status: "Connected", issue: "" } });
    await act(async () => button("Check again").click());
    expect(mocks.check).toHaveBeenCalledWith("site");
    expect(container.textContent).toContain("Connected");
    expect(container.textContent).not.toContain("Retry connection");
    await act(async () => button("Remove domain").click());
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.remove.mockResolvedValue({ ...initial, site: { ...initial.site!, custom_domain: null }, connection: null });
    await act(async () => button("Confirm removal").click());
    expect(mocks.remove).toHaveBeenCalledWith("site");
    expect(container.querySelector('input[name="domain"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("submits a domain and preserves the retry controls after partial setup failure", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<DomainSettings siteId="site" initial={{
      ...initial, site: { ...initial.site!, custom_domain: null }, connection: null,
    }} />));
    const input = container.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Example.COM");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    mocks.connect.mockResolvedValue({ ...initial, connection: null, error: "Setup failed. Retry the connection." });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.connect).toHaveBeenCalledWith("site", "Example.COM");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Setup failed");
    expect(container.textContent).toContain("Retry connection");
    await act(async () => root.unmount());
  });
});
