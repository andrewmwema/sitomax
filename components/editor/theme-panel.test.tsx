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

it("changes buttons, corners, spacing, fonts and palette in one click each, without AI", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  const theme = { headingFont: "Inter" as const, radius: 6 };
  await act(async () => root.render(<ThemePanel siteId="site" theme={theme} open onClose={() => {}} onChange={onChange} />));
  const choose = async (group: string, label: string) => {
    const button = [...container.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}"] button`)].find((item) => item.textContent === label)!;
    await act(async () => button.click());
    return onChange.mock.lastCall![0] as unknown;
  };
  expect(await choose("Button shape", "Pill")).toEqual({ ...theme, buttonStyle: "pill" });
  expect(await choose("Corners", "Soft")).toEqual({ ...theme, radius: 24 });
  expect(await choose("Space between sections", "Spacious")).toEqual({ ...theme, spacing: "spacious" });
  // The current choice is marked: the theme's radius is the Subtle preset, and unset spacing is Comfortable.
  const pressed = ["Button shape", "Corners", "Space between sections"].map((group) =>
    container.querySelector(`[aria-label="${group}"] button[aria-pressed="true"]`)?.textContent ?? null);
  expect(pressed).toEqual([null, "Subtle", "Comfortable"]);
  const pairing = [...container.querySelectorAll("button")].find((button) => button.textContent?.startsWith("Elegant:"))!;
  await act(async () => pairing.click());
  expect(onChange).toHaveBeenLastCalledWith({ ...theme, headingFont: "Playfair Display", bodyFont: "Lato" });
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
