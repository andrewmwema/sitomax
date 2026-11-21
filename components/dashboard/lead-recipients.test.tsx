// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LeadRecipients } from "./lead-recipients";

vi.mock("@/app/(dashboard)/dashboard/sites/[siteId]/leads/actions", () => ({ saveLeadSettings: vi.fn() }));

it("validates, adds, and removes recipients before saving", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<LeadRecipients siteId="site" initial={[]} />));
  const input = container.querySelector<HTMLInputElement>('input[type="email"]')!;
  const add = [...container.querySelectorAll("button")].find((item) => item.textContent === "Add recipient")!;
  const set = async (value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await set("bad");
  await act(async () => add.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("valid email");
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])')?.disabled).toBe(true);
  await set("Client@Example.test");
  await act(async () => add.click());
  expect(container.querySelector<HTMLInputElement>('[name="recipients"]')?.value).toBe("client@example.test");
  await set("client@example.test");
  await act(async () => add.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("already listed");
  await set("");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove client@example.test"]')!.click());
  expect(container.querySelector<HTMLInputElement>('[name="recipients"]')?.value).toBe("");
  expect(container.textContent).toContain("Using account owners by default");
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
});
