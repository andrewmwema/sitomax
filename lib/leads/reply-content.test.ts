// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));
import {
  cleanPastedReplyHtml, leadReplyQuote, leadReplySubject, leadSubjectKey, leadThreadQuote, resolveLeadSignature,
} from "./reply-content";

const values = { name: "Sam Lee", business_name: "Northside Plumbing", phone: "", website: "https://northside.example.test" };

describe("lead reply signature", () => {
  it("defaults to the sender and business details, leaving out what is missing", () => {
    expect(resolveLeadSignature(null, values)).toBe("Sam Lee\nNorthside Plumbing\nhttps://northside.example.test");
    expect(resolveLeadSignature("  ", { ...values, name: "" })).toBe("Northside Plumbing\nhttps://northside.example.test");
  });

  it("fills variables in a saved signature and keeps intentional blank lines", () => {
    expect(resolveLeadSignature("Cheers,\n\n{name} · {business_name}\nCall {phone}\nBook online", values))
      .toBe("Cheers,\n\nSam Lee · Northside Plumbing\nBook online");
    expect(resolveLeadSignature("{phone}\n{name}", values)).toBe("Sam Lee");
  });
});

describe("quoted history", () => {
  it("quotes only the newest message, without the history it already carried", () => {
    const quote = leadReplyQuote({ name: " Alex   Johnson ", at: "2026-11-21T23:30:00Z", text: "Tuesday works.\n\nOn Nov 20, 2026, Northside wrote:\n> When suits you?" });
    expect(quote).toEqual({ header: "On Nov 21, 2026, Alex Johnson wrote:", text: "Tuesday works." });
    expect(leadReplyQuote({ name: "Alex", at: "not a date", text: "Hello" })).toBeNull();
    expect(leadReplyQuote({ name: "Alex", at: "2026-11-21T00:00:00Z", text: "> only quoted" })).toBeNull();
  });

  it("answers the latest email, or the form submission when there is none", () => {
    const lead = { data: { name: "Alex", email: "alex@example.test", message: "Need a quote" }, created_at: "2026-11-01T10:00:00Z" };
    expect(leadThreadQuote(null, lead, "Northside")).toEqual({
      header: "On Nov 1, 2026, Alex wrote:", text: "name: Alex\nemail: alex@example.test\nmessage: Need a quote",
    });
    expect(leadThreadQuote({ direction: "out", body_text: "We can help.", created_at: "2026-11-02T10:00:00Z" }, lead, "Northside")?.header)
      .toBe("On Nov 2, 2026, Northside wrote:");
  });
});

describe("reply subjects", () => {
  it("continues the thread subject and falls back to the business", () => {
    expect(leadReplySubject("Water heater quote", "Northside")).toBe("Re: Water heater quote");
    expect(leadReplySubject("RE: Water heater quote", "Northside")).toBe("RE: Water heater quote");
    expect(leadReplySubject(" ", "Northside")).toBe("Re: your inquiry to Northside");
  });

  it("treats reply and forward prefixes as the same subject", () => {
    expect(leadSubjectKey("Re: RE: Fwd: Water heater ")).toBe(leadSubjectKey("water heater"));
    expect(leadSubjectKey("Water heater")).not.toBe(leadSubjectKey("Invoice"));
  });
});

describe("pasting from Word and Google Docs", () => {
  it("keeps meaning carried by inline styles and drops the presentation", () => {
    const docs = '<meta charset="utf-8"><b style="font-weight:normal" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38;margin-top:0pt">'
      + '<span style="font-size:11pt;font-family:Arial;color:#ff0000;font-weight:700">Bold</span>'
      + '<span style="font-size:11pt;font-style:italic"> italic</span><span style="text-decoration:underline"> under</span>'
      + '<span style="font-family:Arial;font-weight:400"> plain</span></p></b>';
    expect(cleanPastedReplyHtml(docs)).toBe("<p><span><strong>Bold</strong></span><span><em> italic</em></span><span><u> under</u></span><span> plain</span></p>");
  });

  it("removes Office markup, scripts and unsafe links", () => {
    const word = '<p class="MsoNormal" style="margin:0in"><o:p>Hello</o:p> <a href="javascript:alert(1)" style="color:blue">link</a>'
      + '<script>alert(1)</script><!--[if gte mso 9]><xml></xml><![endif]--></p><ul><li style="mso-list:l0">One</li></ul>';
    const clean = cleanPastedReplyHtml(word);
    expect(clean).toContain("Hello");
    expect(clean).toContain("<ul><li>One</li></ul>");
    expect(clean).not.toMatch(/style=|class=|script|javascript:|mso/i);
  });
});
