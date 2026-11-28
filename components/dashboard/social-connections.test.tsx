// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), sync: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/social/actions", () => ({
  connectAccounts: mocks.connect, syncAccounts: mocks.sync,
}));
import { SocialConnections } from "./social-connections";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("social connection handoff", () => {
  it("opens a new tab on click and navigates it when the fresh link arrives", async () => {
    let resolve!: (value: { url: string }) => void;
    mocks.connect.mockReturnValue(new Promise((done) => { resolve = done; }));
    const popup = { opener: window, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<SocialConnections accountId="account" initialAccounts={[]} />));
    expect(container.textContent).toContain("You'll connect through our secure publishing partner.");
    await act(async () => container.querySelector("button")!.click());
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(popup.opener).toBeNull();
    expect(popup.location.replace).not.toHaveBeenCalled();
    await act(async () => resolve({ url: "https://app.upload-post.com/connect?token=first" }));
    expect(popup.location.replace).toHaveBeenCalledWith("https://app.upload-post.com/connect?token=first");
    expect(container.querySelector("a")).toBeNull();
    await act(async () => root.unmount());
  });

  it("provides an isolated fallback link when a popup is blocked", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    mocks.connect.mockResolvedValueOnce({ url: "https://app.upload-post.com/connect?token=first" })
      .mockResolvedValueOnce({ url: "https://app.upload-post.com/connect?token=second" })
      .mockResolvedValueOnce({ error: "Try again later." });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<SocialConnections accountId="account" initialAccounts={[]} />));
    await act(async () => container.querySelector("button")!.click());
    const link = container.querySelector("a")!;
    expect(link.href).toBe("https://app.upload-post.com/connect?token=first");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(container.textContent).toContain("blocked or closed");
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("a")?.href).toBe("https://app.upload-post.com/connect?token=second");
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Try again later.");
    expect(mocks.connect).toHaveBeenCalledTimes(3);
    await act(async () => root.unmount());
  });

  it("offers a fallback if the tab is closed before the link arrives", async () => {
    const popup = { opener: window, closed: true, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    mocks.connect.mockResolvedValue({ url: "https://app.upload-post.com/connect?token=first" });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<SocialConnections accountId="account" initialAccounts={[]} />));
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("a")?.href).toBe("https://app.upload-post.com/connect?token=first");
    expect(popup.location.replace).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("closes the blank tab and shows an error when link generation fails", async () => {
    const popup = { opener: window, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    mocks.connect.mockResolvedValue({ error: "Try again later." });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<SocialConnections accountId="account" initialAccounts={[]} />));
    await act(async () => container.querySelector("button")!.click());
    expect(popup.close).toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Try again later.");
    expect(container.querySelector("a")).toBeNull();
    await act(async () => root.unmount());
  });

  it("closes the tab and shows a generic error if the action rejects", async () => {
    const popup = { opener: window, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.connect.mockRejectedValue(new Error("network error"));
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<SocialConnections accountId="account" initialAccounts={[]} />));
    await act(async () => container.querySelector("button")!.click());
    expect(popup.close).toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Please try again.");
    await act(async () => root.unmount());
  });
});
