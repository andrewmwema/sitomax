import { describe, expect, it } from "vitest";
import { emailTemplates, renderEmailTemplate, renderLeadForwardEmail, renderNewLeadEmail, renderOutgoingLeadReplyEmail } from "./registry";

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

  describe("lead email rendering", () => {
    const richHtml = '<p>Hello <strong>there</strong>, visit <a href="https://example.com">our site</a>.</p><ul><li>First item</li><li>Second item</li></ul>';
    const richText = "Hello there, visit our site (https://example.com).\n- First item\n- Second item";

    it("renders a sanitized outgoing reply as HTML and text", async () => {
      const rendered = await renderOutgoingLeadReplyEmail({
        businessName: "Example Business", bodyHtml: `${richHtml}<script>alert(1)</script><p onclick="alert(1)">Safe</p>`,
        bodyText: `${richText}\nSafe`, phone: "", address: "", website: "https://example.com", branded: "", subject: "Reply",
      });
      expect(rendered.html).toContain("<strong>there</strong>");
      expect(rendered.html).toContain('href="https://example.com"');
      expect(rendered.html).toContain("<li>First item</li>");
      expect(rendered.html).not.toContain("<script>");
      expect(rendered.html).not.toContain("onclick");
      expect(rendered.text).toContain("Hello there");
      expect(rendered.text).toContain("First item");
      expect(rendered.text).toContain("https://example.com");
    });

    it("renders forwarded replies and new lead notifications with rich-text-like content as plain text", async () => {
      const forward = await renderLeadForwardEmail({
        leadName: "Alex", business: "Example Business", bodyText: richText, originalText: richHtml,
        attachments: "", leadId: "lead-id", note: "Reply in the dashboard.", subject: "Re: inquiry",
      });
      const lead = await renderNewLeadEmail({
        siteName: "Example Business", leadId: "lead-id", name: "Alex",
        fields: { Message: richHtml }, formName: "Contact", path: "/contact",
      });
      for (const rendered of [forward, lead]) {
        expect(rendered.html).toContain("<html");
        expect(rendered.html).toContain("&lt;strong&gt;there&lt;/strong&gt;");
        expect(rendered.text).toContain("First item");
        expect(rendered.text).toContain("https://example.com");
      }
      expect(forward.text).toContain("Hello there");
      expect(lead.text).toContain("Message");
    });
  });
});
