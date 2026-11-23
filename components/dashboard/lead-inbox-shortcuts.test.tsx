// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_TRASH_EVENT, LeadInboxShortcuts } from "./lead-inbox-shortcuts";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const press = (key: string, target: EventTarget = document.body, options: KeyboardEventInit = {}) =>
  act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })); });
const clicked = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<>
    <LeadInboxShortcuts />
    <input type="search" name="q" />
    {[0, 1, 2].map((id) => <a key={id} href={`#lead-${id}`} data-lead-link aria-current={id === 1 ? "true" : undefined}
      onClick={(event) => { event.preventDefault(); clicked(id); }}>Lead {id}</a>)}
    <button data-lead-reply onClick={() => clicked("reply")}>Reply</button>
    <button data-lead-archive aria-label="Archive" onClick={() => clicked("archive")} />
    <button data-lead-star onClick={() => clicked("star")}>Star</button>
    <button data-lead-unread aria-label="Mark unread" onClick={() => clicked("unread")} />
    <div contentEditable suppressContentEditableWarning><span>Typing</span></div>
    <div role="dialog"><button>Popover</button></div>
  </>));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("lead keyboard shortcuts", () => {
  it("navigates from the selected lead, opens only a focused lead with Enter, and focuses search", async () => {
    const links = container.querySelectorAll("a");
    await press("j");
    expect(document.activeElement).toBe(links[2]);
    await press("k", links[2]);
    expect(document.activeElement).toBe(links[1]);
    await press("Enter", links[1]);
    expect(clicked).toHaveBeenCalledWith(1);
    await press("/");
    expect(document.activeElement).toBe(container.querySelector("input"));
  });

  it("runs actions and trash once, but never changes an unread lead to read with u", async () => {
    const trash = vi.fn();
    window.addEventListener(LEAD_TRASH_EVENT, trash);
    try {
      for (const key of ["r", "e", "s", "u", "#"]) await press(key);
      expect(clicked.mock.calls.map(([value]) => value)).toEqual(["reply", "archive", "star", "unread"]);
      expect(trash).toHaveBeenCalledOnce();
      container.querySelector("[data-lead-unread]")!.setAttribute("aria-label", "Mark read");
      await press("u");
      await press("#", document.body, { repeat: true });
      expect(clicked).toHaveBeenCalledTimes(4);
      expect(trash).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(LEAD_TRASH_EVENT, trash);
    }
  });

  it("does not intercept editable content, popovers, modifiers or mobile keyboards", async () => {
    for (const target of [container.querySelector("input")!, container.querySelector("[contenteditable] span")!, container.querySelector('[role="dialog"] button')!]) {
      await press("s", target);
    }
    await press("s", document.body, { ctrlKey: true });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    await press("s");
    expect(clicked).not.toHaveBeenCalled();
  });

  it("shows all shortcuts in the help sheet", async () => {
    await press("?");
    const help = container.querySelector("dialog")!;
    expect(help.open).toBe(true);
    for (const text of ["Open focused lead", "Move to trash", "Send reply", "Close composer / details"]) expect(help.textContent).toContain(text);
    await press("s", help.querySelector("button")!);
    expect(clicked).not.toHaveBeenCalled();
  });
});
