import "server-only";

import type { ReactElement } from "react";
import { brand } from "@/lib/brand";
import { Button, EmailLayout, Heading, InfoCard, MessageQuote, StatRow, Text, emailTokens } from "./components";
import { renderEmail, type RenderedEmail } from "./render";
import { submissionFields } from "@/lib/forms/submissions";
import { Html, Head, Preview, Body, Container, Text as EmailText, Section } from "@react-email/components";

export type { RenderedEmail } from "./render";

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

export async function renderPasswordEmail(type: "invite" | "recovery", url: string): Promise<RenderedEmail> {
  const invite = type === "invite";
  const subject = invite ? "You're invited to manage your website" : "Reset your password";
  const heading = invite ? "You're invited" : "Reset your password";
  const body = invite
    ? `You've been invited to manage a website on ${brand.name}. Set your password to accept your invitation.`
    : `We received a request to reset your ${brand.name} password.`;
  return renderEmail(subject,
    invite ? "Accept your website invitation" : "Reset your SitoMax password",
    <EmailLayout preheader={invite ? "Accept your website invitation" : "Reset your SitoMax password"} branding={{ name: brand.name, supportEmail: brand.supportEmail }}>
      <Heading>{heading}</Heading>
      <Text>{body}</Text>
      <Button href={url}>{invite ? "Accept invitation" : "Reset password"}</Button>
      {!invite ? <Text muted>If you didn&apos;t request this, you can ignore this email. This reset link expires soon.</Text> : null}
      <Text muted>If the button doesn&apos;t work, use this link:<br />{url}</Text>
    </EmailLayout>,
  );
}

export async function renderNewLeadEmail(input: {
  siteName: string;
  leadId: string;
  name?: string;
  fields: unknown;
  formName: string;
  path: string;
}): Promise<RenderedEmail> {
  const entries = submissionFields(input.fields).filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .filter(([label]) => !/^email(address)?$/i.test(String(label).replace(/[\s_-]/g, "")))
    .slice(0, 12)
    .map(([label, value]) => ({ label, value: String(value).slice(0, 500) }));
  const subject = `New lead from ${input.siteName}`;
  const url = `${brand.appUrl}/dashboard/forms?lead=${input.leadId}`;
  return renderEmail(subject, "A new inquiry is ready to review",
    <EmailLayout preheader="A new inquiry is ready to review" branding={{ name: brand.name, supportEmail: brand.supportEmail }}>
      <Heading>{subject}</Heading>
      <Text>A new inquiry was submitted through {input.formName || "your website"}.</Text>
      <InfoCard items={[
        { label: "Submitted from", value: input.path || "/" },
        { label: "Contact", value: input.name || "Not provided" },
        ...entries,
      ]} />
      <Button href={url}>Reply now</Button>
      <Text muted>Needs reply · View the full submission in SitoMax.</Text>
    </EmailLayout>,
  );
}

export async function renderLeadTestEmail(siteName: string, siteId: string): Promise<RenderedEmail> {
  const subject = "Test lead notification";
  const url = `${brand.appUrl}/dashboard/forms?site=${siteId}`;
  return renderEmail(subject, "This is a test lead notification",
    <EmailLayout preheader="This is a test lead notification" branding={{ name: brand.name, supportEmail: brand.supportEmail }}>
      <Heading>Test lead notification</Heading>
      <Text>This is a test notification for {siteName}. No lead was created.</Text>
      <Button href={url}>Open leads</Button>
    </EmailLayout>,
  );
}

export async function renderLeadDigestEmail(digest: { email: string; site_id: string; site_name: string; received: number; awaiting: number }): Promise<RenderedEmail> {
  const subject = "Your daily lead digest";
  const url = `${brand.appUrl}/dashboard/forms?site=${digest.site_id}`;
  return renderEmail(subject, `${digest.received} new leads and ${digest.awaiting} awaiting reply`,
    <EmailLayout preheader={`${digest.received} new leads and ${digest.awaiting} awaiting reply`} branding={{ name: brand.name, supportEmail: brand.supportEmail }}>
      <Heading>{digest.site_name} · Daily lead digest</Heading>
      <Text>Here is your lead activity from the previous UTC day.</Text>
      <StatRow stats={[{ label: "New leads", value: String(digest.received) }, { label: "Awaiting reply", value: String(digest.awaiting) }]} />
      <Button href={url}>Open leads</Button>
      <Text muted>Manage notification preferences in your SitoMax dashboard settings.</Text>
    </EmailLayout>,
  );
}

export async function renderLeadForwardEmail(input: {
  leadName: string;
  business: string;
  bodyText: string;
  originalText: string;
  attachments: string;
  leadId: string;
  note: string;
  subject: string;
}): Promise<RenderedEmail> {
  const url = `${brand.appUrl}/dashboard/forms?lead=${input.leadId}`;
  return renderEmail(input.subject, `${input.leadName} replied`,
    <EmailLayout preheader={`${input.leadName} replied`} branding={{ name: brand.name, supportEmail: brand.supportEmail }}>
      <Heading>{input.leadName} replied</Heading>
      <Text muted>Replying by email will not add a copy to SitoMax.</Text>
      <MessageQuote>{input.bodyText}</MessageQuote>
      {input.attachments ? <Text muted>{input.attachments}</Text> : null}
      <Heading>Earlier message</Heading>
      <MessageQuote>{input.originalText}</MessageQuote>
      <Button href={`${url}#reply`}>Reply in SitoMax</Button>
      <Text muted>{input.note}</Text>
    </EmailLayout>,
  );
}

export async function renderOutgoingLeadReplyEmail(input: {
  businessName: string;
  bodyHtml: string;
  bodyText: string;
  phone: string;
  address: string;
  website: string;
  branded: string;
  subject: string;
}): Promise<RenderedEmail> {
  const signatureLines = [input.businessName, input.phone, input.address, input.website].filter(Boolean);
  const element = (
    <Html lang="en">
      <Head><meta name="color-scheme" content="light" /><meta name="supported-color-schemes" content="light" /></Head>
      <Preview>{input.subject} — {input.businessName}</Preview>
      <Body style={{ backgroundColor: "#FFFFFF", margin: 0, padding: "20px 16px", color: emailTokens.body, fontFamily: emailTokens.font, fontSize: 16, lineHeight: 1.6 }}>
        <Container style={{ maxWidth: 600 }}>
          <Section dangerouslySetInnerHTML={{ __html: input.bodyHtml }} />
          <Section style={{ borderTop: `1px solid ${emailTokens.border}`, marginTop: 24, paddingTop: 16 }}>
            {signatureLines.map((line) => <EmailText key={line} style={{ color: emailTokens.muted, fontFamily: emailTokens.font, fontSize: 13, lineHeight: 1.5, margin: "0 0 2px" }}>{line}</EmailText>)}
            {input.branded ? <EmailText style={{ color: emailTokens.muted, fontFamily: emailTokens.font, fontSize: 11, margin: "8px 0 0" }}>{input.branded}</EmailText> : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
  const rendered = await renderEmail(input.subject, `${input.subject} — ${input.businessName}`, element);
  if (!rendered.text.includes(input.businessName)) {
    rendered.text = [input.bodyText, input.businessName, input.phone, input.address, input.website, input.branded].filter(Boolean).join("\n\n");
  }
  return rendered;
}

export async function renderDomainInstructionsEmail(input: {
  domain: string;
  providerName: string;
  steps: readonly string[];
  records: Array<{ type: string; name: string; value: string }>;
  dnsUrl?: string;
}): Promise<RenderedEmail> {
  const subject = `Connect ${input.domain}`;
  return renderEmail(subject, "Add these DNS records to connect your custom domain",
    <EmailLayout preheader="Add these DNS records to connect your custom domain" branding={{ name: brand.name, supportEmail: brand.supportEmail }}>
      <Heading>Connect {input.domain}</Heading>
      <Text>Use {input.providerName} to add the following DNS records.</Text>
      {input.steps.map((step, index) => <Text key={step}>{index + 1}. {step}</Text>)}
      <InfoCard items={input.records.map((record) => ({ label: `${record.type} record`, value: `${record.name} → ${record.value}` }))} />
      <Text muted>Replace conflicting website records only. DNS changes can take up to 48 hours.</Text>
      {input.dnsUrl ? <Button href={input.dnsUrl}>Open DNS settings</Button> : null}
    </EmailLayout>,
  );
}

export async function renderDomainCompleteEmail(domain: string, siteId: string): Promise<RenderedEmail> {
  const subject = "Your domain setup request is complete";
  const url = `${brand.appUrl}/dashboard/sites/${siteId}/domains`;
  return renderEmail(subject, `Setup is complete for ${domain}`,
    <EmailLayout preheader={`Setup is complete for ${domain}`} branding={{ name: brand.name, supportEmail: brand.supportEmail }}>
      <Heading>Domain setup complete</Heading>
      <Text>Your setup request for {domain} is complete. DNS changes can take up to 48 hours.</Text>
      <Button href={url}>Review connection status</Button>
      <Text muted>You can revoke delegated access at your domain provider. We will never ask for your password.</Text>
    </EmailLayout>,
  );
}

export async function renderDomainLiveEmail(domain: string, siteId: string): Promise<RenderedEmail> {
  const subject = "Your domain is live";
  const url = `${brand.appUrl}/dashboard/sites/${siteId}/domains`;
  return renderEmail(subject, `${domain} is now connected`,
    <EmailLayout preheader={`${domain} is now connected`} branding={{ name: brand.name, supportEmail: brand.supportEmail }}>
      <Heading>Domain connected</Heading>
      <Text><strong>{domain}</strong> is now connected to your website. The www address redirects to the root domain.</Text>
      <Button href={url}>Manage domain</Button>
    </EmailLayout>,
  );
}
