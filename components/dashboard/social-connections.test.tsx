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
afterEach(() => vi.unstubAllGlobals());

describe("social connection handoff", () => {
  it("explains the partner handoff and offers each fresh link in an isolated new tab", async () => {
    mocks.connect.mockResolvedValueOnce({ url: "https://app.upload-post.com/connect?token=first" })
      .mockResolvedValueOnce({ url: "https://app.upload-post.com/connect?token=second" });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<SocialConnections accountId="account" initialAccounts={[]} />));
    expect(container.textContent).toContain("You'll connect through our secure publishing partner.");
    expect(container.querySelector("a")).toBeNull();
    const button = container.querySelector("button")!;
    await act(async () => button.click());
    const link = container.querySelector("a")!;
    expect(link.href).toBe("https://app.upload-post.com/connect?token=first");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    await act(async () => button.click());
    expect(container.querySelector("a")?.href).toBe("https://app.upload-post.com/connect?token=second");
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it("removes a previously generated link if regeneration fails", async () => {
    mocks.connect.mockResolvedValueOnce({ url: "https://app.upload-post.com/connect?token=first" })
      .mockResolvedValueOnce({ error: "Try again later." });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<SocialConnections accountId="account" initialAccounts={[]} />));
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("a")).not.toBeNull();
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Try again later.");
    await act(async () => root.unmount());
  });
});
