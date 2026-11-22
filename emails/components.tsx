import type { ReactNode } from "react";
import {
  Body,
  Button as EmailButton,
  Column,
  Container,
  Head,
  Heading as EmailHeading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text as EmailText,
} from "@react-email/components";

export const emailTokens = {
  blue: "#1E51F7",
  navy: "#151829",
  body: "#3A3F55",
  muted: "#6B7085",
  border: "#E6E8EF",
  background: "#F5F6FA",
  card: "#FFFFFF",
  font: '-apple-system, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif',
} as const;

export type EmailBranding = {
  name: string;
  logoUrl?: string | null;
  supportEmail?: string | null;
  address?: string | null;
};

const bodyStyle = { backgroundColor: emailTokens.background, margin: 0, padding: "32px 16px" };
const cardStyle = { backgroundColor: emailTokens.card, border: `1px solid ${emailTokens.border}`, borderRadius: 12, maxWidth: 600, width: "100%" };

export function EmailLayout({
  preheader,
  branding,
  children,
}: {
  preheader: string;
  branding: EmailBranding;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preheader}</Preview>
      <Body style={bodyStyle}>
        <Container style={cardStyle}>
          <Section style={{ borderBottom: `1px solid ${emailTokens.border}`, padding: "24px 32px 20px" }}>
            {branding.logoUrl ? (
              <Img src={branding.logoUrl} alt={branding.name} width="160" height="48" style={{ display: "block", height: 48, maxWidth: 160, objectFit: "contain" }} />
            ) : (
              <div style={{ color: emailTokens.navy, fontFamily: emailTokens.font, fontSize: 20, fontWeight: 700 }}>{branding.name}</div>
            )}
          </Section>
          <Section style={{ padding: "32px" }}>{children}</Section>
          <EmailFooter branding={branding} />
        </Container>
      </Body>
    </Html>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <EmailHeading style={{ color: emailTokens.navy, fontFamily: emailTokens.font, fontSize: 24, lineHeight: 1.25, margin: "0 0 16px" }}>{children}</EmailHeading>;
}

export function Text({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <EmailText style={{ color: muted ? emailTokens.muted : emailTokens.body, fontFamily: emailTokens.font, fontSize: 16, lineHeight: 1.6, margin: "0 0 16px" }}>{children}</EmailText>;
}

export function Button({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "24px 0" }}>
      <EmailButton href={href} style={{ backgroundColor: emailTokens.blue, borderRadius: 8, color: "#FFFFFF", display: "inline-block", fontFamily: emailTokens.font, fontSize: 16, fontWeight: 700, lineHeight: "20px", padding: "14px 22px", textAlign: "center", textDecoration: "none" }}>
        {children}
      </EmailButton>
    </Section>
  );
}

export function InfoCard({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <Section style={{ backgroundColor: "#FAFBFD", border: `1px solid ${emailTokens.border}`, borderRadius: 10, margin: "20px 0", padding: "8px 16px" }}>
      {items.map((item) => (
        <Row key={String(item.label)} style={{ borderBottom: `1px solid ${emailTokens.border}`, padding: "10px 0" }}>
          <Column style={{ color: emailTokens.muted, fontFamily: emailTokens.font, fontSize: 13, width: "35%" }}>{item.label}</Column>
          <Column style={{ color: emailTokens.body, fontFamily: emailTokens.font, fontSize: 14, fontWeight: 600 }}>{item.value}</Column>
        </Row>
      ))}
    </Section>
  );
}

export function Divider() {
  return <Hr style={{ borderColor: emailTokens.border, borderWidth: "1px 0 0", margin: "24px 0" }} />;
}

export function Badge({ children }: { children: ReactNode }) {
  return <span style={{ backgroundColor: "#EEF2FF", borderRadius: 999, color: "#2948B8", fontFamily: emailTokens.font, fontSize: 12, fontWeight: 700, padding: "5px 9px" }}>{children}</span>;
}

export function StatRow({ stats }: { stats: Array<{ label: string; value: string }> }) {
  return (
    <Section style={{ margin: "20px 0" }}>
      <Row>
        {stats.map((stat) => (
          <Column key={stat.label} style={{ padding: "12px", textAlign: "center" }}>
            <div style={{ color: emailTokens.navy, fontFamily: emailTokens.font, fontSize: 24, fontWeight: 700 }}>{stat.value}</div>
            <div style={{ color: emailTokens.muted, fontFamily: emailTokens.font, fontSize: 13, marginTop: 4 }}>{stat.label}</div>
          </Column>
        ))}
      </Row>
    </Section>
  );
}

export function MessageQuote({ children }: { children: ReactNode }) {
  return <Section style={{ borderLeft: `4px solid ${emailTokens.blue}`, backgroundColor: "#F8F9FC", borderRadius: "0 8px 8px 0", margin: "20px 0", padding: "16px 18px", color: emailTokens.body, fontFamily: emailTokens.font, fontSize: 15, lineHeight: 1.6 }}>{children}</Section>;
}

export function EmailFooter({ branding }: { branding: EmailBranding }) {
  const support = branding.supportEmail || "support@sitomax.com";
  return (
    <Section style={{ backgroundColor: "#FAFBFD", borderTop: `1px solid ${emailTokens.border}`, padding: "20px 32px", textAlign: "center" }}>
      <EmailText style={{ color: emailTokens.muted, fontFamily: emailTokens.font, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
        {branding.name}{branding.address ? ` · ${branding.address}` : ""}<br />
        <Link href={`mailto:${support}`} style={{ color: emailTokens.muted }}>{support}</Link>
      </EmailText>
    </Section>
  );
}
