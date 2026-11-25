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
  business: { ...emptyBusiness, businessName: "Local Plumbing", businessType: "Plumber", city: "Nairobi",
    services: ["Drain repairs"], primaryAction: "inquire" as const, audiences: [], description: "" },
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
async function submit() {
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
async function clickButton(text: string) {
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === text)!.click());
}
async function pages() {
  await act(async () => root.render(<AiSiteWizard accounts={[]} existingSite={site} rootDomain="localhost:3000" marketingSubdomain="sitomax" />));
  await setInput("Business type", "Plumber"); await setInput("City / area", "Nairobi");
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>("#ai-services")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Drain repairs");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await submit();
}
async function design() {
  await pages(); await submit();
}
async function review() {
  await design(); await submit();
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
    await design();
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
  it("extracts business facts from pasted text and requires review before continuing", async () => {
    const extracted = {
      businessName: "Example Plumbing", businessType: "Plumber", city: "York", services: ["Drain repairs"],
      difference: "", tone: "", phone: "", email: "", address: "", openingHours: "",
      primaryAction: "book", audiences: ["Homeowners"], description: "Plumbing services for homes in York.",
    };
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ business: extracted }) });
    await act(async () => root.render(<AiSiteWizard accounts={[]} existingSite={site} rootDomain="localhost:3000" marketingSubdomain="sitomax" />));
    const description = [...container.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Describe your business"))!.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(description, "Example Plumbing serves homes in York and books drain repairs.");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickButton("Extract details from description");
    expect(container.textContent).toContain("Review every field");
    expect([...container.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Business name"))!.querySelector("input")!.value).toBe("Example Plumbing");
    expect([...container.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Main action for visitors"))!.querySelector("select")!.value).toBe("book");
    await submit();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("confirm the extracted business details");
    await act(async () => container.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
    await submit();
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("Pages");
  });
  it("uses curated SitoMax designs without offering original custom layouts", async () => {
    await design();
    expect(container.textContent).toContain("SitoMax designs");
    expect(container.textContent).toContain("curated section designs");
    expect(container.textContent).not.toContain("Original custom layout");
    expect(container.querySelector('input[name="generationMode"]')).toBeNull();
  });
  it("requires confirmation only for selected rebuilds and shows a summary before opening the editor", async () => {
    await pages();
    const home = [...container.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Home — Rebuild"))!.querySelector("input")!;
    expect(home.checked).toBe(false);
    await act(async () => home.click());
    await submit(); await submit();
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
    const editors = [...container.querySelectorAll<HTMLAnchorElement>(`a[href="/editor/${site.accountId}"]`)];
    expect(editors).toHaveLength(2);
    for (const link of editors) {
      expect(link.target).toBe("_blank");
      expect(link.rel).toBe("noopener noreferrer");
      expect(link.getAttribute("onclick")).toBeNull();
    }
    expect(mocks.push).not.toHaveBeenCalled();
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
    await clickButton("Back"); await clickButton("Back"); await clickButton("Back");
    await setInput("Phone", "+1 555 0100");
    await submit(); await submit(); await submit();
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
  it("validates the page step and keeps an unsaved custom page from being silently discarded", async () => {
    await pages();
    expect(document.activeElement).toBe(container.querySelector("h2"));
    const about = [...container.querySelectorAll("label")].find((label) => label.textContent === "About")!.querySelector("input")!;
    await act(async () => about.click());
    await submit();
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("Pages");
    expect(container.querySelector("[role=alert]")).not.toBeNull();
    await act(async () => about.click());
    await clickButton("+ Add custom page");
    await setInput("Name", "Emergency repairs");
    await setInput("Purpose", "Describe our emergency repair services");
    await submit();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Add or cancel your custom page");
    await clickButton("Add page");
    await submit();
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("Design");
    await clickButton("Back");
    expect(container.querySelector('[aria-label="Page order"]')?.textContent).toContain("Emergency repairs");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("carries a new site's pending service and selected design through all four steps before requesting generation", async () => {
    await act(async () => root.render(<AiSiteWizard accounts={[{ id: site.accountId, name: "Agency" }]} rootDomain="localhost:3000" marketingSubdomain="sitomax" />));
    await act(async () => {
      const select = container.querySelector("select")!;
      select.value = site.accountId; select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await setInput("Business name", "Local Plumbing"); await setInput("Business type", "Plumber");
    await setInput("City / area", "Nairobi");
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>("#ai-services")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Drain repairs");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const actionSelect = [...container.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Main action for visitors"))!.querySelector("select")!;
    await act(async () => {
      actionSelect.value = "book";
      actionSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>("#ai-audiences")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Homeowners");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await submit(); await submit();
    await setDesignGuidance("A restrained editorial layout");
    await submit();
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("Review & build");
    expect(container.querySelector(".creation-review")?.textContent).toContain("Drain repairs");
    expect(mocks.fetch).not.toHaveBeenCalled();
    await setInput("Site address", "local-plumbing");
    mocks.fetch.mockResolvedValue({ ok: false, headers: new Headers() });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await submit();
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      subdomain: "local-plumbing", services: ["Drain repairs"], designDescription: "A restrained editorial layout",
      primaryAction: "book", audiences: ["Homeowners"],
      desiredPages: ["", "about", "services", "contact"], generationMode: "catalog",
    });
  });
});
