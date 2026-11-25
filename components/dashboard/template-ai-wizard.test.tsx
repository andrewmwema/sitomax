// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateAiWizard } from "./template-ai-wizard";
import { emptyBusiness } from "@/lib/business";
import type { PremiumTemplate } from "@/lib/templates/catalog";

const accountId = "00000000-0000-4000-8000-000000000001";
const fetchMock = vi.fn();
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("template AI intake", () => {
  it("extracts a description and requires confirmation before recommending", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ business: {
      businessName: "Example", businessType: "Plumber", city: "York", services: ["Repairs"], audiences: [],
      difference: "", tone: "", phone: "", email: "", address: "", openingHours: "",
      primaryAction: "book", description: "Plumber in York",
    } }) }).mockResolvedValueOnce({ ok: false, json: async () => ({ message: "No recommendation" }) });
    await act(async () => root.render(<TemplateAiWizard templates={[]} accounts={[{ id: accountId, name: "Example" }]}
      rootDomain="localhost:3000" isSuperAdmin={false} onClose={() => {}} />));
    const description = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(description, "Plumber in York");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Extract business details")!.click());
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/extract-business", expect.objectContaining({
      body: JSON.stringify({ accountId, template: true, text: "Plumber in York" }),
    }));
    const submit = async () => act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await submit();
    expect(container.textContent).toContain("Review and confirm");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows switching to a design outside the two recommendations", async () => {
    const templates: PremiumTemplate[] = ["showcase", "clarity", "studio"].map((id) => ({
      id, name: id, description: `${id} design`, best_for: [], preview_image: "https://example.com/image.jpg",
      theme: {}, business: emptyBusiness, pages: [{ title: "Home", slug: "", nav_label: "Home", data: { root: { props: {} }, content: [] } }],
    }));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ business: {
      ...emptyBusiness, businessName: "Example", businessType: "Plumber", city: "York",
      primaryAction: "book", audiences: [], description: "Plumber in York",
    } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({
      generationId: "00000000-0000-4000-8000-000000000002",
      recommended: { templateId: "showcase", reason: "First" }, runnerUp: { templateId: "clarity", reason: "Second" },
    }) });
    await act(async () => root.render(<TemplateAiWizard templates={templates} accounts={[{ id: accountId, name: "Example" }]}
      rootDomain="localhost:3000" isSuperAdmin={false} onClose={() => {}} />));
    const description = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(description, "Plumber in York");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Extract business details")!.click());
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const labels = [...container.querySelectorAll("label")];
    const other = labels.find((label) => label.textContent?.includes("Other design: studio"))!;
    const radio = other.querySelector<HTMLInputElement>('input[type="radio"]')!;
    await act(async () => radio.click());
    expect(radio.checked).toBe(true);
    expect(container.querySelectorAll('input[name="template"]')).toHaveLength(3);
  });
});
