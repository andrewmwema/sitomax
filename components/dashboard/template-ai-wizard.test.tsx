// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateAiWizard } from "./template-ai-wizard";
import { emptyBusiness } from "@/lib/business";
import type { PremiumTemplate } from "@/lib/templates/catalog";

const logoMocks = vi.hoisted(() => ({ prepare: vi.fn(), upload: vi.fn(), apply: vi.fn() }));
vi.mock("@/app/editor/[pageId]/media-actions", () => ({ prepareMediaUpload: logoMocks.prepare }));
vi.mock("@/app/(dashboard)/dashboard/sites/new/template-logo-actions", () => ({ applyTemplateLogo: logoMocks.apply }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ upload: logoMocks.upload }) } }) }));

const accountId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000003";
const generationId = "00000000-0000-4000-8000-000000000004";
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

  it("shows a recovery link when a checkpointed build stops", async () => {
    fetchMock.mockResolvedValueOnce(new Response([
      JSON.stringify({ type: "progress", message: "Checkpoints ready.", siteId }),
      JSON.stringify({ type: "error", message: "The build stopped." }),
    ].join("\n")));
    await act(async () => root.render(<TemplateAiWizard templates={[]} accounts={[{ id: accountId, name: "Example" }]}
      rootDomain="localhost:3000" initialTemplateId="showcase" isSuperAdmin={false} onClose={() => {}} />));
    const color = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes("Primary brand color"))!.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(color, "#123456");
      color.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).input.primaryColor).toBe("#123456");
    expect(container.textContent).toContain("The build stopped.");
    expect(container.querySelector(`a[href="/dashboard/sites/${siteId}/generate"]`)?.textContent).toBe("unfinished page builds");
    expect(container.textContent).toContain("15 minutes");
  });

  it("uploads the selected logo only after a checkpointed build and reports success", async () => {
    const path = `${siteId}/TEST-logo-123.png`;
    const file = new File(["test"], "TEST-logo.png", { type: "image/png" });
    logoMocks.prepare.mockResolvedValue({ status: "success", bucket: "site-assets", path });
    logoMocks.upload.mockResolvedValue({ error: null });
    logoMocks.apply.mockResolvedValue({ status: "success" });
    fetchMock.mockResolvedValueOnce(new Response([
      JSON.stringify({ type: "progress", message: "Ready", siteId, generationId }),
      JSON.stringify({ type: "result", siteId, pageId: siteId, warnings: [], pages: [] }),
    ].join("\n")));
    await act(async () => root.render(<TemplateAiWizard templates={[]} accounts={[{ id: accountId, name: "Example" }]}
      rootDomain="localhost:3000" initialTemplateId="showcase" isSuperAdmin={false} onClose={() => {}} />));
    const logo = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(logo, "files", { configurable: true, value: [file] });
      logo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(logoMocks.prepare).toHaveBeenCalledWith({ siteId }, expect.objectContaining({ name: "TEST-logo.png" }));
    expect(logoMocks.upload).toHaveBeenCalledWith(path, file, expect.objectContaining({ contentType: "image/png" }));
    expect(logoMocks.apply).toHaveBeenCalledWith(expect.objectContaining({ siteId, generationId, path }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).input).not.toHaveProperty("logo");
    expect(container.textContent).toContain("Your logo was added to the draft header and theme.");
  });

  it("reports a logo conflict without hiding the completed site", async () => {
    logoMocks.prepare.mockResolvedValue({ status: "success", bucket: "site-assets", path: `${siteId}/TEST-logo.png` });
    logoMocks.upload.mockResolvedValue({ error: null });
    logoMocks.apply.mockResolvedValue({ status: "error", message: "The site theme or header changed. Choose your uploaded logo in the editor." });
    fetchMock.mockResolvedValueOnce(new Response([
      JSON.stringify({ type: "progress", message: "Ready", siteId, generationId }),
      JSON.stringify({ type: "result", siteId, pageId: siteId, warnings: [], pages: [] }),
    ].join("\n")));
    await act(async () => root.render(<TemplateAiWizard templates={[]} accounts={[{ id: accountId, name: "Example" }]}
      rootDomain="localhost:3000" initialTemplateId="showcase" isSuperAdmin={false} onClose={() => {}} />));
    const logo = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(logo, "files", { configurable: true, value: [new File(["test"], "TEST-logo.png", { type: "image/png" })] });
      logo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("Your draft is ready to review");
    expect(container.textContent).toContain("Choose your uploaded logo in the editor.");
  });

  it("does not upload a logo when no site checkpoint was confirmed", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ type: "error", message: "The build stopped." })));
    await act(async () => root.render(<TemplateAiWizard templates={[]} accounts={[{ id: accountId, name: "Example" }]}
      rootDomain="localhost:3000" initialTemplateId="showcase" isSuperAdmin={false} onClose={() => {}} />));
    const logo = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(logo, "files", { configurable: true, value: [new File(["test"], "TEST-logo.png", { type: "image/png" })] });
      logo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(logoMocks.prepare).not.toHaveBeenCalled();
    expect(container.textContent).toContain("The logo was not uploaded.");
  });
});
