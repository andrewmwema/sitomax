import { describe, expect, it } from "vitest";
import { leadReplyParts } from "@/lib/leads/reply-content";
import { brand } from "@/lib/brand";
import { emailTemplates, renderEmailTemplate, renderLeadDigestEmail, renderLeadTestEmail, renderLeadForwardEmail, renderNewLeadEmail, renderOutgoingLeadReplyEmail } from "./registry";

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
        bodyText: `${richText}\nSafe`, signature: "Sam Lee\nExample Business", branded: "", subject: "Reply",
        quote: { header: "On Nov 21, 2026, Alex wrote:", text: "Can you help?\n<b>Thanks</b>" },
      });
      expect(rendered.html).toContain("<strong>there</strong>");
      expect(rendered.html).toContain('href="https://example.com"');
      expect(rendered.html).toContain("<li>First item</li>");
      expect(rendered.html).not.toContain("<script>");
      expect(rendered.html).not.toContain("onclick");
      expect(rendered.text).toContain("Hello there");
      expect(rendered.text).toContain("First item");
      expect(rendered.text).toContain("https://example.com");
      expect(rendered.text).toContain("--\nSam Lee\nExample Business");
      expect(rendered.text).toContain("On Nov 21, 2026, Alex wrote:\n> Can you help?\n> <b>Thanks</b>");
      expect(rendered.html).toContain("&lt;b&gt;Thanks&lt;/b&gt;");
    });

    it("marks the parts of an outgoing reply so the conversation can collapse the quote", async () => {
      const rendered = await renderOutgoingLeadReplyEmail({
        businessName: "Example Business", bodyHtml: "<p>Tuesday works.</p>", bodyText: "Tuesday works.",
        signature: "Sam Lee", branded: "Sent via Agency", subject: "Reply",
        quote: { header: "On Nov 21, 2026, Alex wrote:", text: "Is Tuesday free?" },
      });
      const parts = leadReplyParts(rendered.html);
      expect(parts.body).toContain("<p>Tuesday works.</p>");
      expect(parts.body).toContain("Sam Lee");
      expect(parts.body).not.toContain("Is Tuesday free?");
      expect(parts.body).not.toContain("Reply — Example Business");
      expect(parts.quote).toContain("On Nov 21, 2026, Alex wrote:");
      expect(parts.quote).toContain("<blockquote");
    });

    it("hides the inbox preview text of replies sent before parts were marked", async () => {
      const legacy = '<body><div style="display:none" data-skip-in-text="true">Reply — Acme<div> \u200c</div></div><table><tr><td><div><p>Hello</p></div></td></tr></table></body>';
      expect(leadReplyParts(legacy)).toEqual({ body: "<p>Hello</p>", quote: "" });
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
      for (const [rendered, suffix] of [[lead, ""], [forward, "#reply"]] as const) {
        const url = `${brand.appUrl}/dashboard/leads/lead-id${suffix}`;
        expect(rendered.html).toContain(`href="${url}"`);
        expect(rendered.text).toContain(url);
        expect(rendered.html).not.toContain("/dashboard/forms");
        expect(rendered.html).not.toContain("?view=");
      }
    });

    it("opens the new site-filtered inbox for test notifications and digests", async () => {
      const emails = await Promise.all([
        renderLeadTestEmail("Example", "site-id"),
        renderLeadDigestEmail({ email: "owner@example.test", site_id: "site-id", site_name: "Example", received: 2, awaiting: 1 }),
      ]);
      for (const rendered of emails) {
        const url = `${brand.appUrl}/dashboard/leads?site=site-id`;
        expect(rendered.html).toContain(`href="${url}"`);
        expect(rendered.text).toContain(url);
      }
    });
  });
});
