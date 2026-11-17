// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextEncoder } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
import { AiSiteWizard } from "./ai-site-wizard";
import { emptyBusiness } from "@/lib/business";

let container: HTMLDivElement, root: Root;
const site = { id: "00000000-0000-4000-8000-000000000001", accountId: "00000000-0000-4000-8000-000000000002", name: "Local Plumbing", business: emptyBusiness };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", mocks.fetch);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function setInput(label: string, value: string) {
  const input = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label))!.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function review() {
  await act(async () => root.render(<AiSiteWizard accounts={[]} existingSite={site} rootDomain="localhost:3000" />));
  await setInput("Business type", "Plumber"); await setInput("City / area", "Nairobi");
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>("#ai-services")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Drain repairs");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

describe("AI site wizard", () => {
  it("prefills previously saved business information", async () => {
    const business = { ...emptyBusiness, businessName: "Example", businessType: "Plumber", city: "York", services: ["Repairs"], tone: "Friendly" };
    await act(async () => root.render(<AiSiteWizard accounts={[]} existingSite={{ ...site, business }} rootDomain="localhost:3000" />));
    const field = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith("Tone of voice"))!.querySelector("input")!;
    expect(field.value).toBe("Friendly");
    expect(container.textContent).toContain("Repairs");
  });
  it("requires explicit draft replacement confirmation, decodes chunked UTF-8 progress and opens the editor with review warnings", async () => {
    await review();
    expect(container.textContent).toContain("This will replace your current unpublished changes. You can restore them from version history.");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Confirm replacement");
    await act(async () => { container.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(); });
    const bytes = new TextEncoder().encode(`${JSON.stringify({ type: "progress", message: "Designing Home…" })}\n${JSON.stringify({
      type: "result", siteId: site.id, pageId: site.accountId, warnings: ["Image placeholders were used."],
    })}\n`);
    const split = bytes.indexOf(0xe2) + 1;
    mocks.fetch.mockResolvedValue({ ok: true, body: new ReadableStream({
      start(controller) { controller.enqueue(bytes.slice(0, split)); controller.enqueue(bytes.slice(split)); controller.close(); },
    }) });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/editor/${site.accountId}`));
    });
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ siteId: site.id, confirmReplace: true, services: ["Drain repairs"] });
    expect(container.textContent).toContain("Image placeholders were used.");
  });
  it("surfaces an interrupted stream without claiming success or redirecting", async () => {
    await review();
    await act(async () => { container.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(); });
    mocks.fetch.mockResolvedValue({ ok: true, body: new ReadableStream({ start(controller) { controller.close(); } }) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector("[role=alert]")?.textContent).toContain("connection ended before confirmation");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
