import DOMPurify from "isomorphic-dompurify";
import { escapeHtml, sanitizeRichText } from "@/lib/richtext";

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
