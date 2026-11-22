import "server-only";

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
