import "server-only";

import { render } from "@react-email/render";
import type { ReactNode } from "react";
import { brand } from "@/lib/brand";

const shell = (children: ReactNode) => (
  <html>
    <body style={{ margin: 0, backgroundColor: "#f5f7fa", color: "#162033", fontFamily: "Arial, sans-serif" }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: "#f5f7fa" }}>
        <tbody><tr><td align="center" style={{ padding: "32px 16px" }}>
          <table role="presentation" width="600" cellPadding={0} cellSpacing={0} style={{ width: "100%", maxWidth: "600px", backgroundColor: "#ffffff", borderRadius: "8px" }}>
            <tbody><tr><td style={{ padding: "24px 32px", borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>
              {brand.name}
            </td></tr><tr><td style={{ padding: "32px" }}>{children}</td></tr></tbody>
          </table>
        </td></tr></tbody>
      </table>
    </body>
  </html>
);

export function LeadReplyEmail({ html, signature, branded }: { html: string; signature: string; branded: string }) {
  return shell(
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {signature ? <p style={{ whiteSpace: "pre-wrap", marginTop: "24px", color: "#475569" }}>{signature}</p> : null}
      {branded ? <p style={{ color: "#64748b", fontSize: "12px" }}>{branded}</p> : null}
    </>,
  );
}

export function NewLeadEmail({ summary, leadUrl, label = "View lead" }: { summary: string; leadUrl: string; label?: string }) {
  return shell(
    <>
      <p style={{ lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{summary}</p>
      <p style={{ marginTop: "24px" }}>
        <a href={leadUrl} style={{ display: "inline-block", backgroundColor: "#2563eb", color: "#ffffff", textDecoration: "none", borderRadius: "6px", padding: "12px 18px" }}>{label}</a>
      </p>
    </>,
  );
}

export async function renderEmailTemplate(template: ReactNode) {
  const [html, text] = await Promise.all([
    render(template),
    render(template, { plainText: true }),
  ]);
  return { html, text };
}
