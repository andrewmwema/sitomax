// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomainSettingsState } from "@/lib/domains";
import { DomainSettings } from "./domain-settings";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), inspect: vi.fn(), check: vi.fn(), remove: vi.fn(), email: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/sites/[siteId]/domains/actions", () => ({
  connectSiteDomain: mocks.connect, inspectSiteDomain: mocks.inspect, checkSiteDomain: mocks.check,
  removeSiteDomain: mocks.remove, emailDomainInstructions: mocks.email,
}));
const initial: DomainSettingsState = {
  site: { id: "site", name: "Client", subdomain: "client", custom_domain: "example.com", domain_verified: false,
    domain_provider: "godaddy", domain_pending_since: new Date().toISOString(), domain_check_stopped_at: null },
  connection: { status: "Pending", issue: "Ownership verification is pending.", records: [
    { type: "A", name: "example.com", value: "192.0.2.1" },
    { type: "CNAME", name: "www.example.com", value: "target.example.net" },
    { type: "TXT", name: "_verify.example.com", value: "ownership-token" },
  ] },
  conflicts: [{ type: "A", name: "example.com", value: "23.1.2.3" }], error: "", success: "",
};
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); document.body.innerHTML = "";
});
const button = (container: HTMLElement, label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label)!;
async function setup(state = initial) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<DomainSettings siteId="site" initial={state} />));
  return { container, root };
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("domain wizard", () => {
  it("shows exact records and conflicts, copies values, checks status and confirms removal", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    const { container, root } = await setup();
    expect(container.textContent).toContain("DNS changes can take up to 48 hours.");
    expect(container.textContent).toContain("Delete this old record: A @ 23.1.2.3");
    expect(container.textContent).toContain("ownership-token");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Copy TXT record value"]')!.click());
    expect(copy).toHaveBeenCalledWith("ownership-token");
    mocks.check.mockResolvedValue({ ...initial, site: { ...initial.site!, domain_verified: true },
      connection: { ...initial.connection!, status: "Connected", issue: "" } });
    await act(async () => button(container, "I've updated my DNS").click());
    expect(mocks.check).toHaveBeenCalledWith("site");
    expect(container.textContent).toContain("Your domain is live");
    await act(async () => button(container, "Remove domain").click());
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.remove.mockResolvedValue({ ...initial, site: { ...initial.site!, custom_domain: null }, connection: null });
    await act(async () => button(container, "Confirm removal").click());
    expect(mocks.remove).toHaveBeenCalledWith("site");
    expect(container.querySelector('input[name="domain"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("detects the provider before provisioning and lets the user override it", async () => {
    const { container, root } = await setup({ ...initial, site: { ...initial.site!, custom_domain: null }, connection: null });
    await fill(container.querySelector("input")!, "Example.COM");
    mocks.inspect.mockResolvedValue({ error: "", inspection: {
      domain: "example.com", providerId: "godaddy", nameservers: ["ns1.domaincontrol.com"], records: [],
    } });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(container.textContent).toContain("We detected your domain is managed by GoDaddy");
    await act(async () => {
      const select = container.querySelector("select")!; select.value = "cloudflare";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    mocks.connect.mockResolvedValue({ ...initial, connection: null, error: "Setup failed. Retry the connection." });
    await act(async () => button(container, "Show my DNS instructions").click());
    expect(mocks.connect).toHaveBeenCalledWith("site", "example.com", "cloudflare");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Setup failed");
    expect(container.textContent).toContain("Retry connection");
    await act(async () => root.unmount());
  });

  it("polls at 30 seconds, stops on connection and cleans up on unmount", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    mocks.check.mockResolvedValue(initial);
    const { root } = await setup();
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
    expect(mocks.check).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.check).toHaveBeenCalledWith("site", true);
    mocks.check.mockResolvedValue({ ...initial, site: { ...initial.site!, domain_verified: true },
      connection: { ...initial.connection!, status: "Connected", issue: "" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.check).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(mocks.check).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not automatically poll after 14 days and emails provider instructions", async () => {
    vi.useFakeTimers();
    const { container, root } = await setup({ ...initial, site: { ...initial.site!,
      domain_pending_since: new Date(Date.now() - 15 * 86_400_000).toISOString() } });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.check).not.toHaveBeenCalled();
    await act(async () => button(container, "Send these instructions to my web person").click());
    await fill(container.querySelector('input[type="email"]')!, "web@example.com");
    mocks.email.mockResolvedValue({ error: "", success: "Instructions sent." });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.email).toHaveBeenCalledWith("site", "web@example.com", "godaddy");
    expect(container.textContent).toContain("Instructions sent.");
    await act(async () => root.unmount());
  });

  it("pauses hidden tabs and cancels pending polling when the wizard closes", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    mocks.check.mockResolvedValue(initial);
    const { root } = await setup();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.check).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.check).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
