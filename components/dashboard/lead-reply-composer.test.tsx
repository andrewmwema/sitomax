import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/dashboard/forms/reply-actions", () => ({
  draftLeadReply: vi.fn(), saveLeadReplyTemplate: vi.fn(), sendLeadReply: vi.fn(),
}));

import { LeadReplyComposer } from "./lead-reply-composer";

const props = {
  leadId: "lead", siteId: "site", to: "lead@example.test", from: '"Acme" <leads@example.test>',
  replyTo: "reply@example.test", replyToError: null, replyMode: "tracked" as const,
  business: "Acme", firstName: "Lead", signature: "Acme", siteUrl: "https://example.test",
  canCopy: false, templates: [], pages: [],
};

describe("lead reply addresses", () => {
  it("shows the sending and tracked reply-to addresses", () => {
    const html = renderToStaticMarkup(<LeadReplyComposer {...props} />);
    expect(html).toContain("leads@example.test");
    expect(html).toContain("reply@example.test");
    expect(html).toContain("are tracked here when inbound email is configured");
  });

  it("explains direct routing and unavailable addresses", () => {
    const direct = renderToStaticMarkup(<LeadReplyComposer {...props} replyMode="direct" />);
    expect(direct).toContain("go directly to this mailbox");
    const missing = renderToStaticMarkup(<LeadReplyComposer {...props} from={null} replyTo={null}
      replyToError="Tracked replies are not configured. Contact your agency." />);
    expect(missing).toContain("Not configured. Contact your agency.");
    expect(missing).toContain("Tracked replies are not configured.");
    expect(missing).not.toContain("reply@example.test");
  });
});
