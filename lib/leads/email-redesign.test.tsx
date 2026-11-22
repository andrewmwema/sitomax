import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";
import { LeadReplyEmail, NewLeadEmail, renderEmailTemplate } from "@/lib/email/templates";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("POSTMARK_SERVER_TOKEN", "test-token");
  vi.stubEnv("POSTMARK_FROM_EMAIL", "sender@example.test");
  vi.stubEnv("POSTMARK_MESSAGE_STREAM", "outbound");
  vi.stubEnv("POSTMARK_LEADS_STREAM", "lead-replies");
  vi.stubEnv("LEADS_FROM_DOMAIN", "mail.example.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe("redesign lead email templates", () => {
  it("renders and sends a lead reply with HTML and text alternatives", async () => {
    const rendered = await renderEmailTemplate(
      <LeadReplyEmail html="<p>Thanks for your <strong>inquiry</strong>. <a href=&quot;https://example.test&quot;>Learn more</a></p><ul><li>Option one</li></ul>" signature="Acme\n555-0100" branded="Sent via SitoMax" />,
    );
    fetchMock.mockResolvedValueOnce(Response.json({ MessageID: "reply-id", ErrorCode: 0 }));
    await sendEmail({
      to: "lead@example.test",
      subject: "Re: your inquiry",
      replyTo: "thread+token@mail.example.test",
      from: '"Acme" <leads@mail.example.test>',
      stream: "lead-replies",
      tag: "lead-reply",
      html: rendered.html,
      text: rendered.text,
    });
    expect(rendered.html).toContain("Thanks for your ");
    expect(rendered.html).toContain("inquiry");
    expect(rendered.html).toContain("<strong>");
    expect(rendered.html).toContain("<a");
    expect(rendered.html).toContain("<ul>");
    expect(rendered.text).toContain("Thanks for your inquiry.");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      Subject: "Re: your inquiry",
      ReplyTo: "thread+token@mail.example.test",
      From: '"Acme" <leads@mail.example.test>',
      MessageStream: "lead-replies",
      Tag: "lead-reply",
    });
  });

  it("renders and sends a new-lead notification with a lead link", async () => {
    const rendered = await renderEmailTemplate(
      <NewLeadEmail summary="A new inquiry was saved for Acme." leadUrl="https://app.example.test/dashboard/forms?lead=lead-id" />,
    );
    fetchMock.mockResolvedValueOnce(Response.json({ MessageID: "lead-id", ErrorCode: 0 }));
    await sendEmail({
      to: "owner@example.test",
      subject: "New website lead",
      tag: "form-notification",
      html: rendered.html,
      text: rendered.text,
    });
    expect(rendered.html).toContain("/dashboard/forms?lead=lead-id");
    expect(rendered.text).toContain("/dashboard/forms?lead=lead-id");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      Subject: "New website lead",
      Tag: "form-notification",
    });
  });

  it("renders a forwarded lead reply and original message without React HTML injection", async () => {
    const html = "<p><strong>Sam replied</strong></p><p>Please <em>call</em> me.</p><p>Original message:</p><blockquote><p>I need help.</p></blockquote><p><a href=\"https://app.example.test/dashboard/forms?lead=lead-id\">View conversation</a></p>";
    const rendered = await renderEmailTemplate(
      <LeadReplyEmail html={html} signature="" branded="" />,
    );
    expect(rendered.html).toContain("Sam replied");
    expect(rendered.html).toContain("Please ");
    expect(rendered.html).toContain("call");
    expect(rendered.text).toContain("I need help.");
  });
});
