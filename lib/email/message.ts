import "server-only";

import { brand, brandLogo } from "@/lib/brand";

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function emailBody(text: string, action?: { label: string; url: string }) {
  const paragraphs = escapeHtml(text).split("\n\n").map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`).join("");
  return {
    preheader: text.slice(0, 140).replace(/\n/g, " "),
    text: action ? `${text}\n\n${action.label}: ${action.url}` : text,
    html: action ? `${paragraphs}<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>` : paragraphs,
  };
}

const EMAIL_LOGO_WIDTH = 160;

/** Adds the hosted SitoMax logo above an emailBody() message; only for SitoMax's own emails, never tenant-branded ones. */
export function withBrandLogo<T extends { html: string }>(body: T): T {
  const src = new URL(brandLogo.email.path, brand.appUrl).href;
  const height = Math.round(EMAIL_LOGO_WIDTH * brandLogo.email.height / brandLogo.email.width);
  return { ...body, html: `<p><img src="${escapeHtml(src)}" alt="${escapeHtml(brandLogo.alt)}" width="${EMAIL_LOGO_WIDTH}" height="${height}" style="display:block;border:0;width:${EMAIL_LOGO_WIDTH}px;height:${height}px"></p>${body.html}` };
}
