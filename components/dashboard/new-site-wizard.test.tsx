// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

const mocks = vi.hoisted(() => ({ push: vi.fn(), check: vi.fn(), create: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/app/(dashboard)/dashboard/sites/new/actions", () => ({ checkSubdomain: mocks.check, createSite: mocks.create }));
vi.mock("@/components/editor/design-thumbnail", () => ({ DesignThumbnail: () => <div>Template preview</div> }));
import { NewSiteWizard } from "./new-site-wizard";

const accountId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const props: ComponentProps<typeof NewSiteWizard> = {
  accounts: [{ id: accountId, name: "Agency", is_internal: true }],
  choices: [{ key: "plumber", name: "Plumber", theme: {}, design: {
    id: "preview", name: "Plumber", blockType: "Hero", category: "Hero", props: {}, thumbnail: null, styles: ["classic"],
    description: "Preview of the template hero.", bestFor: ["Template preview"],
    metadata: { editableFields: ["heading"], repeatableFields: [], limits: {}, imageSlots: [] },
  } }],
  rootDomain: "localhost:3000", marketingSubdomain: "sitomax",
};
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.check.mockResolvedValue({ available: true, message: "Available" });
  mocks.create.mockResolvedValue({ status: "success", siteId });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function submit() {
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
async function setInput(label: string, value: string) {
  const input = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label))!.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function details() {
  await act(async () => root.render(<NewSiteWizard {...props} />));
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = accountId; select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await submit();
  await act(async () => container.querySelector<HTMLInputElement>("input[type=radio]")!.click());
  await submit();
  for (const [label, value] of [
    ["Business name", "Local Plumbing"], ["Phone", "+1 555 0100"], ["City", "Nairobi"],
    ["Services", "Drain repairs"], ["Email", "owner@example.com"], ["Address", "10 Main Street"],
    ["Site address", "local-plumbing"],
  ]) await setInput(label, value);
}

describe("Template site creation", () => {
  it("reviews entered details without publishing, preserves them on Back, then creates only on final confirmation", async () => {
    await details();
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await submit();
    expect(container.querySelector("h2")?.textContent).toBe("Review & create");
    expect(document.activeElement).toBe(container.querySelector("h2"));
    expect(container.querySelector(".creation-review")?.textContent).toContain("Local Plumbing");
    expect(container.textContent).toContain("Your site will be published immediately.");
    expect(mocks.create).not.toHaveBeenCalled();
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Back")!.click());
    const businessName = [...container.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Business name"))!.querySelector("input")!;
    expect(businessName.value).toBe("Local Plumbing");
    await submit(); await submit();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      accountId, template: "plumber", businessName: "Local Plumbing", subdomain: "local-plumbing", services: "Drain repairs",
    }));
    expect(mocks.push).toHaveBeenCalledWith(`/dashboard/sites/${siteId}`);
  });
  it("ignores an obsolete availability response and blocks review until the current address is verified", async () => {
    let resolveOld!: (result: { available: boolean; message: string }) => void;
    mocks.check.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    await details();
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await setInput("Site address", "another-plumber");
    await act(async () => resolveOld({ available: true, message: "Old address is available" }));
    await submit();
    expect(container.querySelector("h2")?.textContent).toBe("Business details");
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Check that the subdomain is available");
    expect(mocks.create).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await submit();
    expect(container.querySelector("h2")?.textContent).toBe("Review & create");
    expect(container.querySelector(".creation-review")?.textContent).toContain("another-plumber");
  });
});
