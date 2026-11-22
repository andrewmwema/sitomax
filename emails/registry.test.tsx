import { describe, expect, it } from "vitest";
import { emailTemplates, renderEmailTemplate } from "./registry";

describe("email template foundation", () => {
  it("renders every registered template with HTML, text and preheader", async () => {
    for (const template of emailTemplates) {
      const rendered = await renderEmailTemplate(template.id);
      expect(rendered.subject).toBeTruthy();
      expect(rendered.preheader).toBeTruthy();
      expect(rendered.html).toContain("<html");
      expect(rendered.text.trim().length).toBeGreaterThan(20);
      expect(rendered.html).not.toMatch(/\[(?:Add|insert|todo|placeholder)\]/i);
      expect(rendered.text).not.toMatch(/\[(?:Add|insert|todo|placeholder)\]/i);
    }
  });
});
