import "server-only";

import type { ReactElement } from "react";
import { brand } from "@/lib/brand";
import { Button, EmailLayout, Heading, InfoCard, MessageQuote, StatRow, Text } from "./components";
import { renderEmail, type RenderedEmail } from "./render";

export type EmailTemplateId =
  | "password-reset"
  | "client-invite"
  | "new-lead"
  | "lead-test"
  | "lead-digest"
  | "reply-forward"
  | "outgoing-reply"
  | "domain-instructions"
  | "domain-request-complete"
  | "domain-live";

export const emailTemplates: Array<{ id: EmailTemplateId; name: string }> = [
  { id: "password-reset", name: "Password reset" },
  { id: "client-invite", name: "Client invitation" },
  { id: "new-lead", name: "New lead notification" },
  { id: "lead-test", name: "Lead test notification" },
  { id: "lead-digest", name: "Daily lead digest" },
  { id: "reply-forward", name: "Reply received" },
  { id: "outgoing-reply", name: "Outgoing lead reply" },
  { id: "domain-instructions", name: "Domain instructions" },
  { id: "domain-request-complete", name: "Domain setup complete" },
  { id: "domain-live", name: "Domain connected" },
];

function sampleTemplate(id: EmailTemplateId): ReactElement {
  const branding = { name: brand.name, supportEmail: brand.supportEmail };
  const actionUrl = `${brand.appUrl}/dashboard`;
  switch (id) {
    case "password-reset":
      return <EmailLayout preheader="Reset your SitoMax password" branding={branding}><Heading>Reset your password</Heading><Text>We received a request to reset your password.</Text><Button href={`${actionUrl}/auth/callback`}>Reset password</Button><Text muted>This link expires soon. If you didn&apos;t request this, you can ignore this email.</Text></EmailLayout>;
    case "client-invite":
      return <EmailLayout preheader="You have been invited to manage a website" branding={branding}><Heading>You&apos;re invited</Heading><Text>Your agency has invited you to manage a website with {brand.name}.</Text><Button href={actionUrl}>Accept invitation</Button></EmailLayout>;
    case "new-lead":
      return <EmailLayout preheader="A new website lead needs your attention" branding={branding}><Heading>New lead from Northside Plumbing</Heading><Text>A new inquiry is ready to review.</Text><InfoCard items={[{ label: "Name", value: "Alex Johnson" }, { label: "Email", value: "alex@example.com" }, { label: "Phone", value: "(555) 123-4567" }, { label: "Message", value: "I need a quote for water heater replacement." }]} /><Button href={`${actionUrl}/dashboard/forms?lead=sample`}>Reply now</Button></EmailLayout>;
    case "lead-test":
      return <EmailLayout preheader="This is a test lead notification" branding={branding}><Heading>Test lead notification</Heading><Text>This is a test notification for Northside Plumbing. No lead was created.</Text><Button href={`${actionUrl}/dashboard/forms`}>Open leads</Button></EmailLayout>;
    case "lead-digest":
      return <EmailLayout preheader="Your daily lead summary" branding={branding}><Heading>Daily lead digest</Heading><StatRow stats={[{ label: "New leads", value: "8" }, { label: "Awaiting reply", value: "3" }]} /><Button href={`${actionUrl}/dashboard/forms`}>Open leads</Button></EmailLayout>;
    case "reply-forward":
      return <EmailLayout preheader="A lead replied to your email" branding={branding}><Heading>Alex Johnson replied</Heading><MessageQuote>Thanks, Tuesday afternoon works for me.</MessageQuote><Button href={`${actionUrl}/dashboard/forms?lead=sample#reply`}>Reply in SitoMax</Button></EmailLayout>;
    case "outgoing-reply":
      return <EmailLayout preheader="A reply from Northside Plumbing" branding={branding}><Heading>Northside Plumbing</Heading><Text>Hi Alex, Tuesday afternoon works for us. We look forward to helping.</Text><Text muted>Northside Plumbing<br />555-555-0123<br />northsideplumbing.example</Text></EmailLayout>;
    case "domain-instructions":
      return <EmailLayout preheader="DNS instructions for your custom domain" branding={branding}><Heading>Connect www.example.com</Heading><Text>Add these DNS records at your provider.</Text><InfoCard items={[{ label: "A record", value: "76.76.21.21" }, { label: "CNAME", value: "cname.vercel-dns.com" }]} /><Text muted>DNS changes can take up to 48 hours.</Text></EmailLayout>;
    case "domain-request-complete":
      return <EmailLayout preheader="Your domain setup request is complete" branding={branding}><Heading>Domain setup complete</Heading><Text>Your setup request for example.com is complete.</Text><Button href={`${actionUrl}/dashboard/sites/sample/domains`}>Review connection status</Button></EmailLayout>;
    case "domain-live":
      return <EmailLayout preheader="Your custom domain is connected" branding={branding}><Heading>Domain connected</Heading><Text>https://example.com is now connected to your website. The www address redirects to the root domain.</Text><Button href={`${actionUrl}/dashboard/sites/sample/domains`}>Manage domain</Button></EmailLayout>;
  }
}

export async function renderEmailTemplate(id: EmailTemplateId): Promise<RenderedEmail> {
  const subject = {
    "password-reset": "Reset your password",
    "client-invite": "You're invited to manage your website",
    "new-lead": "New website lead",
    "lead-test": "Test lead notification",
    "lead-digest": "Your daily lead digest",
    "reply-forward": "A lead replied",
    "outgoing-reply": "A reply from Northside Plumbing",
    "domain-instructions": "Connect your custom domain",
    "domain-request-complete": "Your domain setup request is complete",
    "domain-live": "Your domain is live",
  }[id];
  return renderEmail(subject, `${subject} — ${brand.name}`, sampleTemplate(id));
}
