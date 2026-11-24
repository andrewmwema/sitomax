// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBusiness } from "@/lib/business";
import type { PremiumTemplate } from "@/lib/templates/catalog";
import { PremiumTemplateGallery } from "./premium-template-gallery";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/(dashboard)/dashboard/sites/new/template-actions", () => ({
  createSiteFromMasterTemplate: vi.fn(),
}));

const templates: PremiumTemplate[] = ["Clarity", "Studio"].map((name) => ({
  id: name.toLowerCase(), name, description: `${name} design`, best_for: [],
  preview_image: "https://example.com/image.png", theme: {},
  business: { ...emptyBusiness, businessName: name },
  pages: [{ title: "Home", slug: "", nav_label: "Home", data: {
    root: { props: {} }, content: [],
  } }],
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function click(selector: string) {
  const element = container.querySelector<HTMLButtonElement>(selector);
  expect(element).not.toBeNull();
  await act(async () => element!.click());
}

describe("Premium template gallery dialog", () => {
  it("closes the native modal and allows another template to open", async () => {
    await act(async () => root.render(<PremiumTemplateGallery templates={templates}
      accounts={[{ id: "account", name: "Client" }]} isSuperAdmin={false} rootDomain="example.com" />));
    const dialog = container.querySelector("dialog")!;

    await click("article:first-child button");
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("h2")?.textContent).toBe("Clarity");
    await click('[aria-label="Close design preview"]');
    expect(dialog.open).toBe(false);
    expect(dialog.querySelector("h2")).toBeNull();

    await click("article:last-child button");
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("h2")?.textContent).toBe("Studio");
  });

  it("closes from the creation step and resets after a native close", async () => {
    await act(async () => root.render(<PremiumTemplateGallery templates={templates}
      accounts={[{ id: "account", name: "Client" }]} isSuperAdmin={false} rootDomain="example.com" />));
    const dialog = container.querySelector("dialog")!;

    await click("article:first-child button");
    await act(async () => [...dialog.querySelectorAll("button")].find((button) => button.textContent?.includes("Use this design"))!.click());
    expect(dialog.textContent).toContain("Create your draft");
    await click('[aria-label="Close design preview"]');
    expect(dialog.open).toBe(false);

    await click("article:last-child button");
    expect(dialog.textContent).toContain("Design preview");
    await act(async () => dialog.close());
    expect(dialog.open).toBe(false);
    expect(dialog.querySelector("h2")).toBeNull();
  });
});
