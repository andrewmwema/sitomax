// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ heartbeat: vi.fn(), beacon: vi.fn() }));
vi.mock("@/app/editor/[pageId]/presence-actions", () => ({ heartbeatPageEditor: mocks.heartbeat }));
import { EditorConcurrencyNotice } from "./editor-concurrency-notice";

const OTHER_TAB = "This page is open in another tab";
const open = new Map<string, Set<string>>();
/** Stands in for the presence RPC: open sessions per page, counting the others. */
async function presence(pageId: string, sessionId: string, close = false) {
  const sessions = open.get(pageId) ?? new Set<string>();
  open.set(pageId, sessions);
  if (close) sessions.delete(sessionId);
  else sessions.add(sessionId);
  return { others: [...sessions].filter((id) => id !== sessionId).length };
}
const heartbeats = () => mocks.heartbeat.mock.calls.filter(([, , close]) => !close);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  open.clear();
  mocks.heartbeat.mockReset().mockImplementation(presence);
  mocks.beacon.mockReset().mockReturnValue(true);
  Object.defineProperty(navigator, "sendBeacon", { value: mocks.beacon, configurable: true });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("never counts its own tab as another editor when React remounts it, and closes the session once it is gone", async () => {
  await act(async () => root.render(<StrictMode><EditorConcurrencyNotice pageId="page" reloadRequired={false} /></StrictMode>));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(new Set(heartbeats().map(([, session]) => session)).size).toBe(1);
  expect(open.get("page")?.size).toBe(1);

  await act(async () => presence("page", "another-tab"));
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(container.textContent).toContain(OTHER_TAB);

  await act(async () => root.unmount());
  expect([...open.get("page")!]).toEqual(["another-tab"]);
  const calls = mocks.heartbeat.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(mocks.heartbeat).toHaveBeenCalledTimes(calls);
});

it("closes its session when the tab is closed or reloaded, and reopens it if the page is restored", async () => {
  await act(async () => root.render(<EditorConcurrencyNotice pageId="page" reloadRequired={false} />));
  const session = heartbeats()[0][1];
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  expect(mocks.beacon).toHaveBeenCalledTimes(1);
  expect(mocks.beacon.mock.calls[0][0]).toBe("/api/editor/presence");
  expect(JSON.parse(mocks.beacon.mock.calls[0][1])).toEqual({ pageId: "page", sessionId: session });

  await act(async () => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
  expect(heartbeats().at(-1)).toEqual(["page", session]);
  expect(heartbeats()).toHaveLength(2);
});

it("stops claiming another tab is open when a check fails or is overdue, and recovers on the next answer", async () => {
  await act(async () => presence("page", "another-tab"));
  await act(async () => root.render(<EditorConcurrencyNotice pageId="page" reloadRequired={false} />));
  expect(container.textContent).toContain(OTHER_TAB);

  mocks.heartbeat.mockRejectedValueOnce(new Error("offline"));
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(container.textContent).not.toContain(OTHER_TAB);
  expect(container.textContent).toContain("Version checks still protect your saves");

  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(container.textContent).toContain(OTHER_TAB);

  let answer!: (result: { others: number }) => void;
  mocks.heartbeat.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(container.textContent).toContain(OTHER_TAB);
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(container.textContent).not.toContain(OTHER_TAB);
  expect(container.textContent).toContain("Version checks still protect your saves");
  await act(async () => answer({ others: 0 }));
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("checks again as soon as a hidden tab becomes visible", async () => {
  await act(async () => root.render(<EditorConcurrencyNotice pageId="page" reloadRequired={false} />));
  await act(async () => presence("page", "another-tab"));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(container.textContent).toContain(OTHER_TAB);
});

it("offers reload after a save conflict", async () => {
  await act(async () => root.render(<EditorConcurrencyNotice pageId="page" reloadRequired />));
  expect(container.textContent).toContain("Your unsaved changes are still in this tab");
  expect(container.querySelector("button")?.textContent).toBe("Reload page");
});

it("waits for an in-flight heartbeat before closing so unmount cannot leave a resurrected session", async () => {
  let finish!: (result: { others: number }) => void;
  mocks.heartbeat.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  await act(async () => root.render(<EditorConcurrencyNotice pageId="page" reloadRequired={false} />));
  const session = mocks.heartbeat.mock.calls[0][1];
  await act(async () => root.unmount());
  expect(mocks.heartbeat).toHaveBeenCalledTimes(1);
  await act(async () => finish({ others: 1 }));
  expect(mocks.heartbeat).toHaveBeenLastCalledWith("page", session, true);
  expect(container.textContent).toBe("");
});
