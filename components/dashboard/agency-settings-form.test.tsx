// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencySettingsForm } from "./agency-settings-form";
import type { ActionState } from "@/lib/form-state";

vi.mock("@/components/editor/image-upload-field", () => ({
  ImageUploadField: ({ value, onChange, readOnly }: { value: string; onChange: (value: string) => void; readOnly: boolean }) =>
    <button type="button" disabled={readOnly} onClick={() => onChange(value ? "" : "/logo.png")}>{value ? "Remove image" : "Choose image"}</button>,
}));

const settings = { name: "North Agency", supportEmail: "help@example.test", primaryColor: "#4b3fe0", logoUrl: null };
const account = { name: "Agency Admin", email: "admin@example.test" };
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function changeInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label)!;

describe("agency settings workspace", () => {
  it("previews changes, warns before losing edits, and discards to the last saved appearance", async () => {
    await act(async () => root.render(<AgencySettingsForm settings={settings} account={account} action={vi.fn()} />));
    expect(button("Save settings").disabled).toBe(true);
    await act(async () => changeInput(container.querySelector<HTMLInputElement>('[name="name"]')!, "Updated Agency"));
    expect(container.querySelector('[aria-label="Branding preview"]')?.textContent).toContain("Updated Agency");
    expect(button("Save settings").disabled).toBe(false);
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const sectionLink = container.querySelector<HTMLAnchorElement>('a[href="#agency-branding"]')!;
    sectionLink.addEventListener("click", (event) => event.preventDefault());
    sectionLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(confirm).not.toHaveBeenCalled();
    const leave = document.createElement("a"); leave.href = "/dashboard/sites"; container.append(leave);
    const navigation = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    leave.dispatchEvent(navigation);
    expect(navigation.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    await act(async () => button("Discard changes").click());
    expect(container.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe("North Agency");
    expect(button("Save settings").disabled).toBe(true);
    const cleanUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
  });

  it("keeps failed edits unsaved and sets the save baseline only after a successful action", async () => {
    const action = vi.fn<(previous: ActionState, data: FormData) => Promise<ActionState>>()
      .mockResolvedValueOnce({ status: "error", message: "Could not save settings." })
      .mockResolvedValueOnce({ status: "success", message: "Settings saved." });
    await act(async () => root.render(<AgencySettingsForm settings={settings} account={account} action={action} />));
    await act(async () => changeInput(container.querySelector<HTMLInputElement>('[name="name"]')!, "Updated Agency"));
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not save settings.");
    expect(button("Save settings").disabled).toBe(false);
    await act(async () => button("Choose image").click());
    expect(container.querySelector<HTMLInputElement>('[name="logo_url"]')?.value).toBe("/logo.png");
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(action.mock.calls[1][1].get("logo_url")).toBe("/logo.png");
    expect(button("Save settings").disabled).toBe(true);
    expect(container.querySelector("footer")?.textContent).toContain("Settings saved.");
    await act(async () => changeInput(container.querySelector<HTMLInputElement>('[name="name"]')!, "Another change"));
    await act(async () => button("Discard changes").click());
    expect(container.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe("Updated Agency");
  });

  it("locks editing during a save and removes a stale failure after discarding", async () => {
    let finish!: (state: ActionState) => void;
    const action = vi.fn(() => new Promise<ActionState>((resolve) => { finish = resolve; }));
    await act(async () => root.render(<AgencySettingsForm settings={settings} account={account} action={action} />));
    await act(async () => changeInput(container.querySelector<HTMLInputElement>('[name="name"]')!, "Updated Agency"));
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(container.querySelector('[name="name"]')?.matches(":disabled")).toBe(true);
    expect(button("Choose image").disabled).toBe(true);
    expect(button("Saving...").disabled).toBe(true);
    await act(async () => finish({ status: "error", message: "Could not save settings." }));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not save settings.");
    await act(async () => button("Discard changes").click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("footer")?.textContent).toContain("All changes saved");
    expect(button("Save settings").disabled).toBe(true);
  });
});
