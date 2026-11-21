// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ThemePanel } from "./theme-panel";

vi.mock("@/app/editor/[pageId]/actions", () => ({ saveSiteTheme: vi.fn() }));
vi.mock("./image-upload-field", () => ({ ImageUploadField: () => null }));

it("updates the site theme from a hex color", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  await act(async () => root.render(<ThemePanel siteId="site" theme={{}} open onClose={() => {}} onChange={onChange} />));
  const input = container.querySelector<HTMLInputElement>('[aria-label="Primary color hex"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "#abcdef");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  expect(onChange).toHaveBeenCalledWith({ colors: { primary: "#abcdef" } });
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
