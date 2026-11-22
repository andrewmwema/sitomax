import DOMPurify from "isomorphic-dompurify";
import { escapeHtml, sanitizeRichText } from "@/lib/richtext";
import { submissionContact, submissionFields } from "@/lib/forms/submissions";

export function replyTextHtml(text: string) {
  return `<p>${escapeHtml(text).replace(/\r?\n/g, "<br>")}</p>`;
}

export function replyHtmlText(html: string) {
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
  const read = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? "";
    if (node.nodeName === "BR") return "\n";
    const children = Array.from(node.childNodes).map(read).join("");
    const link = node.nodeName === "A" ? (node as Element).getAttribute("href") : null;
    return `${node.nodeName === "LI" ? "- " : ""}${children}${link && link !== children ? ` (${link})` : ""}${/^(P|DIV|LI|H[1-6]|BLOCKQUOTE)$/.test(node.nodeName) ? "\n" : ""}`;
  };
  return read(fragment).trim().replace(/\n{3,}/g, "\n\n");
}

export function cleanLeadEmailHtml(html: string) {
  return sanitizeRichText(html);
}

export function stripQuotedReply(text: string) {
  return text.split(/^\s*(?:On .+ wrote:|From: .+|-----Original Message-----|>).*$/im, 1)[0].trim();
}

export function leadPlaceholders(text: string) {
  return [...new Set(text.match(/\[[^\]\n]{1,120}\]/g) ?? [])];
}

export function applyLeadTemplate(text: string, variables: { first_name: string; business_name: string }) {
  return text.replace(/\{(first_name|business_name)\}/g, (_, key: keyof typeof variables) => variables[key]);
}

export type LeadReplyQuote = { header: string; text: string };
export type LeadSignatureValues = { name: string; business_name: string; phone: string; website: string };
export const leadSignatureVariables = ["name", "business_name", "phone", "website"] as const;
export const LEAD_SIGNATURE_MAX = 1000;
const QUOTE_MAX = 3000;

/** A saved signature may use {name}, {business_name}, {phone} and {website}; a line whose variables are all empty is left out. */
export function resolveLeadSignature(custom: string | null | undefined, values: LeadSignatureValues) {
  const template = custom?.trim() || "{name}\n{business_name}\n{phone}\n{website}";
  const variable = /\{(name|business_name|phone|website)\}/g;
  return template.split(/\r?\n/).flatMap((line) => {
    const used = [...line.matchAll(variable)].map((match) => values[match[1] as keyof LeadSignatureValues].trim());
    if (used.length && used.every((value) => !value)) return [];
    return [line.replace(variable, (_, key: keyof LeadSignatureValues) => values[key].trim()).trimEnd()];
  }).join("\n").trim().slice(0, LEAD_SIGNATURE_MAX);
}

export function leadReplyQuote(source: { name: string; at: string; text: string }): LeadReplyQuote | null {
  const text = stripQuotedReply(source.text).slice(0, QUOTE_MAX).trim();
  const date = new Date(source.at);
  if (!text || Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return { header: `On ${day}, ${source.name.replace(/\s+/g, " ").trim() || "the sender"} wrote:`, text };
}

/** The message a reply answers: the latest email in the thread, or the original form submission. */
export function leadThreadQuote(
  latest: { direction: "in" | "out"; body_text: string; created_at: string } | null,
  lead: { data: unknown; created_at: string }, business: string,
) {
  const contact = submissionContact(lead.data);
  const leadName = contact.name || contact.email || "the customer";
  if (latest) return leadReplyQuote({ name: latest.direction === "out" ? business : leadName, at: latest.created_at, text: latest.body_text });
  const text = submissionFields(lead.data).map(([field, value]) => `${field}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join("\n");
  return leadReplyQuote({ name: leadName, at: lead.created_at, text });
}

export function leadReplySubject(previous: string | null | undefined, business: string) {
  const subject = previous?.replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  if (!subject) return `Re: your inquiry to ${business}`.slice(0, 200);
  return (/^re:/i.test(subject) ? subject : `Re: ${subject}`).slice(0, 200);
}

/** Compares subjects ignoring reply and forward prefixes, so a thread only repeats a subject when it changes. */
export function leadSubjectKey(subject: string) {
  return subject.replace(/^(?:\s*(?:re|fwd?)\s*:\s*)+/i, "").trim().toLowerCase();
}

/**
 * Splits a stored outgoing email into the parts the conversation shows.
 * Emails sent before the parts were marked fall back to the whole message
 * without its hidden inbox preview text.
 */
export function leadReplyParts(html: string) {
  const part = (name: string) => new RegExp(`<div data-reply-part="${name}"[^>]*>([\\s\\S]*?)</div>`).exec(html)?.[1];
  const body = part("body");
  if (body === undefined) {
    return { body: cleanLeadEmailHtml(html.replace(/<div[^>]*data-skip-in-text="true"[^>]*>[\s\S]*?<\/div>\s*<\/div>/, "")), quote: "" };
  }
  return { body: cleanLeadEmailHtml(`${body}${part("signature") ?? ""}`), quote: cleanLeadEmailHtml(part("quote") ?? "") };
}

/**
 * Word and Google Docs paste presentational markup. Keep the meaning
 * (bold, italic, underline, lists, links) and drop everything else.
 * Parsed in an inert document first because sanitizing removes the
 * inline styles that carry that meaning.
 */
export function cleanPastedReplyHtml(html: string) {
  if (typeof DOMParser === "undefined") return cleanLeadEmailHtml(html);
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const wrap = (element: Element, tag: string) => {
    const wrapper = element.ownerDocument.createElement(tag);
    wrapper.append(...Array.from(element.childNodes));
    element.append(wrapper);
  };
  for (const element of Array.from(body.querySelectorAll("*"))) {
    const style = element.getAttribute("style") ?? "";
    const weight = /font-weight:\s*([a-z0-9]+)/i.exec(style)?.[1].toLowerCase();
    const bold = weight === "bold" || weight === "bolder" || Number(weight) >= 600;
    if (/^(B|STRONG)$/.test(element.nodeName) && weight !== undefined && !bold) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    if (element.nodeName === "SPAN" || element.nodeName === "FONT") {
      if (bold) wrap(element, "strong");
      if (/font-style:\s*italic/i.test(style)) wrap(element, "em");
      if (/text-decoration[^;]*underline/i.test(style) && !element.closest("a")) wrap(element, "u");
    }
    element.removeAttribute("style");
  }
  return cleanLeadEmailHtml(body.innerHTML);
}
