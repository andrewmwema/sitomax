// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mark: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/forms/actions", () => ({ markLeadViewed: mocks.mark }));
import { MarkLeadViewed } from "./mark-lead-viewed";
import { LocalTime } from "./local-time";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.mark.mockReset();
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("lead view", () => {
  it("marks the viewed version read and shows failures", async () => {
    mocks.mark.mockResolvedValue({ error: "Could not mark this lead as read. Refresh and try again." });
    await act(async () => root.render(<MarkLeadViewed id="lead" lastActivity="2026-01-01T00:00:00Z" />));
    expect(mocks.mark).toHaveBeenCalledWith({ id: "lead", lastActivity: "2026-01-01T00:00:00Z" });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Refresh");
  });

  it("renders a local timestamp and full local date in the title", async () => {
    const value = "2026-01-01T00:00:00Z";
    await act(async () => root.render(<LocalTime value={value} />));
    const time = container.querySelector("time")!;
    const date = new Date(value);
    expect(time.textContent).toBe(date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
    expect(time.title).toBe(date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" }));
  });
});
