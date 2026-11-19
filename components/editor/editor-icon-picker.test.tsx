// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorIconPicker } from "./editor-icon-picker";
import { BlockIcon } from "@/components/blocks/ui/icon";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  editable: true,
  item: { type: "Services", props: { id: "services-1", services: [{ icon: "wrench", title: "Repairs" }] } },
}));
vi.mock("@puckeditor/core", () => ({
  registerOverlayPortal: () => () => {},
  useGetPuck: () => () => ({
    appState: { data: { root: {}, content: [mocks.item] } },
    config: { components: { Services: { fields: {
      services: { type: "array", arrayFields: { icon: { type: "custom", aiKind: "icon" }, title: { type: "text" } } },
    } } } },
    getPermissions: () => ({ edit: mocks.editable }), dispatch: mocks.dispatch,
  }),
}));
vi.mock("@/lib/editor/tree", () => ({
  ROOT_ZONE: "root:default-zone",
  editorTree: () => [{ item: mocks.item, selector: { index: 0, zone: "root:default-zone" }, parentId: null }],
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.editable = true;
  mocks.item.props.services[0].icon = "wrench";
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

describe("canvas icon picker", () => {
  it("opens from an icon, searches and applies name, size and color as one undoable edit", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const canvas = document.createElement("div"); document.body.append(canvas);
    canvas.innerHTML = '<div data-editor-block="services-1"><svg tabindex="0" data-icon-path="services.0.icon"></svg></div>';
    const root = createRoot(host);
    await act(async () => root.render(<EditorIconPicker />));
    await act(async () => canvas.querySelector("svg")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const dialog = () => document.querySelector<HTMLDialogElement>('dialog[aria-label="Choose icon"]')!;
    expect(dialog().open).toBe(true);
    const search = dialog().querySelector<HTMLInputElement>('[aria-label="Search icons"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "droplet");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(dialog().querySelector('[aria-label="wrench"]')).toBeNull();
    await act(async () => dialog().querySelector<HTMLButtonElement>('[aria-label="droplets"]')!.click());
    const change = async (label: string, value: string) => {
      await act(async () => {
        const select = dialog().querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
        select.value = value; select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    await change("Icon size", "48");
    await change("Icon color", "primary");
    expect(mocks.dispatch).not.toHaveBeenCalled();
    await act(async () => [...dialog().querySelectorAll("button")].find((button) => button.textContent === "Apply icon")!.click());
    expect(mocks.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      type: "replace", recordHistory: true, destinationIndex: 0,
      data: { type: "Services", props: { id: "services-1", services: [{ title: "Repairs", icon: { name: "droplets", size: 48, color: "primary" } }] } },
    }));
    await act(async () => root.unmount());
    canvas.remove(); host.remove(); vi.unstubAllGlobals();
  });

  it("supports keyboard activation, cancels without changes and respects block permissions", async () => {
    const host = document.createElement("div"); document.body.append(host);
    host.innerHTML = '<div data-editor-block="services-1"><svg data-icon-path="services.0.icon"></svg></div>';
    const canvas = host.firstElementChild!; document.body.append(canvas);
    const root = createRoot(host);
    await act(async () => root.render(<EditorIconPicker />));
    await act(async () => canvas.querySelector("svg")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(document.querySelector("dialog")).not.toBeNull();
    await act(async () => [...document.querySelectorAll("dialog button")].find((button) => button.textContent === "Cancel")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.querySelector("dialog")).toBeNull();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    mocks.editable = false;
    await act(async () => canvas.querySelector("svg")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.querySelector("dialog")).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("cannot be edited");
    await act(async () => root.unmount());
    canvas.remove(); host.remove(); vi.unstubAllGlobals();
  });

  it("renders icon overrides publicly without editor interaction attributes", () => {
    const html = renderToStaticMarkup(<BlockIcon name={{ name: "droplets", size: 48, color: "primary" }} />);
    expect(html).toContain('width="48"');
    expect(html).toContain("var(--color-primary)");
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain("data-icon-path");
  });
});
