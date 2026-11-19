// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { InteractionContext, type InspectorTab } from "./interaction-context";
import { EditorInspector } from "./editor-inspector";

vi.mock("@puckeditor/core", () => ({
  createUsePuck: () => (selector: (state: object) => unknown) => selector({
    selectedItem: { type: "Hero", props: { id: "hero", heading: "[Add a headline]", design: {
      appearance: { desktop: { backgroundColor: "#ffffff", textColor: "#ffffff" } },
    } } },
    appState: { data: { root: { props: {} } }, ui: { viewports: { current: { width: 1280 } } } },
    getPermissions: () => ({ edit: true }),
  }),
  useGetPuck: () => () => ({ dispatch: vi.fn() }),
}));
vi.mock("./design-field", () => ({
  DesignField: ({ panelTab }: { panelTab: string }) => <div data-design-tab={panelTab} />,
}));

function InspectorHarness() {
  const [tab, setTab] = useState<InspectorTab>("content");
  return <InteractionContext.Provider value={{
    pageId: "page", accountId: "account", userId: "user", pages: [], tab, setTab,
    device: "desktop", setDevice: () => {}, menu: null, setMenu: () => {},
  }}>
    <EditorInspector fields={{ heading: <input defaultValue="[Add a headline]" /> }} isLoading={false} />
  </InteractionContext.Provider>;
}

describe("editor inspector", () => {
  it("groups spacing under Design, retains Motion, and flags placeholder fields", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<InspectorHarness />));
    expect(container.querySelector(".editor-placeholder-field")?.textContent).toContain("Replace placeholder");
    const tab = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) => item.textContent === name)!;
    expect([...container.querySelectorAll('[role="tab"]')].map((item) => item.textContent)).toEqual(["Content", "Design", "Motion"]);
    expect(tab("Content").tabIndex).toBe(0);
    expect(tab("Design").tabIndex).toBe(-1);
    await act(async () => tab("Content").dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement).toBe(tab("Motion"));
    expect(container.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(tab("Motion").id);
    await act(async () => tab("Motion").dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(document.activeElement).toBe(tab("Content"));
    await act(async () => tab("Design").click());
    expect(container.textContent).toContain("WCAG AA recommends");
    const spacing = [...container.querySelectorAll("button")].find((item) => item.textContent === "spacing")!;
    await act(async () => spacing.click());
    expect(tab("Design").getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[data-design-tab="spacing"]')).not.toBeNull();
    await act(async () => tab("Motion").click());
    expect(container.querySelector('[data-design-tab="animation"]')).not.toBeNull();
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});
