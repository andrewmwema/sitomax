// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextEncoder } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
import { AiSiteWizard } from "./ai-site-wizard";
import { emptyBusiness } from "@/lib/business";
import { createGenerationInputSchema } from "@/lib/ai/site-input";

let container: HTMLDivElement, root: Root;
const site = { id: "00000000-0000-4000-8000-000000000001", accountId: "00000000-0000-4000-8000-000000000002", name: "Local Plumbing",
  business: { ...emptyBusiness, businessName: "Local Plumbing", businessType: "Plumber", city: "Nairobi", services: ["Drain repairs"] },
  pages: [{ slug: "", label: "Home", empty: false }, { slug: "about", label: "About", empty: true }] };
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
  await act(async () => root.render(<AiSiteWizard accounts={[]} existingSite={site} rootDomain="localhost:3000" marketingSubdomain="sitomax" />));
  await setInput("Business type", "Plumber"); await setInput("City / area", "Nairobi");
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>("#ai-services")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Drain repairs");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
async function setDesignGuidance(value: string) {
  const field = container.querySelector<HTMLTextAreaElement>("#ai-design-guidance")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("AI site wizard", () => {
  it("accepts 5,000 guidance characters and rejects longer text without truncating it", () => {
    const schema = createGenerationInputSchema();
    const required = {
      accountId: site.accountId, siteId: site.id, businessName: "Example", businessType: "Plumber", city: "Nairobi",
      services: ["Repairs"], style: "auto", primaryColor: "", secondaryColor: "", phone: "", email: "",
      difference: "", address: "", description: "", confirmReplace: true,
    };
    expect(schema.parse({ ...required, designDescription: "x".repeat(5000) }).designDescription).toHaveLength(5000);
    expect(schema.safeParse({ ...required, designDescription: "x".repeat(5001) })).toMatchObject({
      success: false, error: { issues: [expect.objectContaining({ message: "More design guidance must be 5,000 characters or fewer." })] },
    });
    expect(schema.safeParse({ ...required, designDescription: " ".repeat(5001) }).success).toBe(false);
  });
  it("shows a live counter and limit message, and preserves full guidance when moving between steps", async () => {
    await review();
    const guidance = "y".repeat(5001);
    await setDesignGuidance(guidance);
    expect(container.querySelector("#ai-design-guidance-count")?.textContent).toContain("5,001 / 5,000");
    expect(container.querySelector("#ai-design-guidance-error")?.textContent).toContain("1 character over the 5,000-character limit");
    expect(container.querySelector<HTMLTextAreaElement>("#ai-design-guidance")?.value).toBe(guidance);
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Back")!.click(); });
    expect(container.querySelector("#ai-design-guidance")).toBeNull();
    const continueButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Continue")!;
    await act(async () => continueButton.click());
    expect(container.querySelector<HTMLTextAreaElement>("#ai-design-guidance")?.value).toBe(guidance);
    expect(container.querySelector("#ai-design-guidance-error")?.textContent).toContain("Shorten it before building");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect([...container.querySelectorAll("[role=alert]")].some((item) =>
      item.textContent?.includes("More design guidance must be 5,000 characters or fewer"))).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("prefills previously saved business information", async () => {
    const business = { ...emptyBusiness, businessName: "Example", businessType: "Plumber", city: "York", services: ["Repairs"], tone: "Friendly" };
    await act(async () => root.render(<AiSiteWizard accounts={[]} existingSite={{ ...site, business }} rootDomain="localhost:3000" marketingSubdomain="sitomax" />));
    const field = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith("Tone of voice"))!.querySelector("input")!;
    expect(field.value).toBe("Friendly");
    expect(container.textContent).toContain("Repairs");
  });
  it("requires confirmation only for selected rebuilds and shows a summary before opening the editor", async () => {
    await review();
    const home = [...container.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Home — Rebuild"))!.querySelector("input")!;
    expect(home.checked).toBe(false);
    await act(async () => home.click());
    expect(container.textContent).toContain("Only selected drafts will be replaced");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Confirm that the selected drafts");
    await act(async () => { container.querySelector<HTMLInputElement>("input[type=checkbox][required]")!.click(); });
    const bytes = new TextEncoder().encode(`${JSON.stringify({ type: "progress", message: "Designing Home…" })}\n${JSON.stringify({
      type: "result", siteId: site.id, pageId: site.accountId, warnings: ["Image placeholders were used."],
      pages: [{ slug: "about", label: "About", built: true, pageId: site.accountId }],
    })}\n`);
    const split = bytes.indexOf(0xe2) + 1;
    mocks.fetch.mockResolvedValue({ ok: true, headers: new Headers(), body: new ReadableStream({
      start(controller) { controller.enqueue(bytes.slice(0, split)); controller.enqueue(bytes.slice(split)); controller.close(); },
    }) });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Open editor")!.click());
    expect(mocks.push).toHaveBeenCalledWith(`/editor/${site.accountId}`);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ siteId: site.id, confirmReplace: true, services: ["Drain repairs"] });
    expect(container.textContent).toContain("Image placeholders were used.");
  });
  it("surfaces an interrupted stream without claiming success or redirecting", async () => {
    await review();
    mocks.fetch.mockResolvedValue({ ok: true, headers: new Headers(), body: new ReadableStream({ start(controller) { controller.close(); } }) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector("[role=alert]")?.textContent).toContain("connection ended before confirmation");
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("requires a separate confirmation for shared Business changes and sends the saved baseline", async () => {
    await review();
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Back")!.click());
    await setInput("Phone", "+1 555 0100");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("published pages too");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector("[role=alert]")?.textContent).toContain("site-wide Business");
    expect(mocks.fetch).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLInputElement>("input[type=checkbox][required]")!.click());
    mocks.fetch.mockResolvedValue({ ok: false, headers: new Headers() });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      confirmBusinessUpdate: true, expectedBusiness: site.business, phone: "+1 555 0100",
    });
  });
});
