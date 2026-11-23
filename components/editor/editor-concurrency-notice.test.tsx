// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ heartbeat: vi.fn() }));
vi.mock("@/app/editor/[pageId]/presence-actions", () => ({ heartbeatPageEditor: mocks.heartbeat }));
import { EditorConcurrencyNotice } from "./editor-concurrency-notice";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  mocks.heartbeat.mockReset().mockResolvedValue({ others: 0 });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("uses separate sessions per mounted editor, refreshes the warning and closes both sessions", async () => {
  await act(async () => root.render(<>
    <EditorConcurrencyNotice pageId="page" reloadRequired={false} />
    <EditorConcurrencyNotice pageId="page" reloadRequired={false} />
  </>));
  const first = mocks.heartbeat.mock.calls[0][1];
  const second = mocks.heartbeat.mock.calls[1][1];
  expect(first).not.toBe(second);
  expect(container.textContent).toBe("");
  mocks.heartbeat.mockResolvedValue({ others: 1 });
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2);
  expect(container.textContent).toContain("This page is open in another tab — changes may overwrite each other");
  await act(async () => root.unmount());
  expect(mocks.heartbeat).toHaveBeenCalledWith("page", first, true);
  expect(mocks.heartbeat).toHaveBeenCalledWith("page", second, true);
  const calls = mocks.heartbeat.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(mocks.heartbeat).toHaveBeenCalledTimes(calls);
});

it("surfaces presence failures, recovers on the next heartbeat and offers reload after a save conflict", async () => {
  mocks.heartbeat.mockRejectedValueOnce(new Error("offline"));
  await act(async () => root.render(<EditorConcurrencyNotice pageId="page" reloadRequired={false} />));
  expect(container.textContent).toContain("Version checks still protect your saves");
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(container.querySelector('[role="alert"]')).toBeNull();
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
