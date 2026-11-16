/**
 * SECURITY: the Embed element runs arbitrary third-party HTML/JS, so only
 * the agency (super admin) may add or change one. Clients may keep, move
 * or delete embeds the agency placed, never create or edit them.
 *
 * Enforced in three layers:
 *  1. Editor UI: Embed is hidden from the component list and read-only
 *     for clients (lib/puck/editor-config.ts).
 *  2. Server Actions: hasUnauthorizedEmbeds() rejects crafted payloads
 *     (app/editor/[pageId]/actions.ts).
 *  3. Postgres: the guard_page_embeds trigger applies the same rule to
 *     every write, including direct API calls
 *     (supabase/migrations/0007_layout_embeds.sql).
 *
 * At render time the code only ever runs inside a sandboxed iframe
 * (allow-scripts, never allow-same-origin), so it cannot touch the
 * site, its cookies or the editor even if it is malicious.
 */

export const EMBED_TYPE = "Embed";
export const EMBED_MAX_LENGTH = 20_000;

/** Every object anywhere in the data with type === "Embed". */
export function collectEmbeds(data: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === EMBED_TYPE) found.push(record);
    Object.values(record).forEach(walk);
  };
  walk(data);
  return found;
}

/**
 * The code of an embed item. Anything that isn't a plain string (a
 * crafted payload) maps to a value that never matches stored code.
 */
function embedCode(embed: Record<string, unknown>): string | null {
  const props = embed.props;
  if (!props || typeof props !== "object") return "";
  const code = (props as Record<string, unknown>).code;
  if (code === undefined || code === null) return "";
  return typeof code === "string" ? code : null;
}

/**
 * True when `next` contains embed code that isn't already on the page
 * (its current draft or published data). Only the code matters: moving,
 * resizing, retitling, duplicating or deleting an agency embed is fine;
 * adding or changing code is agency-only. Empty embeds render nothing.
 */
export function hasUnauthorizedEmbeds(next: unknown, previous: unknown[]): boolean {
  const allowed = new Set(previous.flatMap(collectEmbeds).map(embedCode));
  return collectEmbeds(next).some((embed) => {
    const code = embedCode(embed);
    return code === null || (code !== "" && !allowed.has(code));
  });
}

/** Embed code as stored, trimmed to the size limit. */
export function safeEmbedCode(value: unknown): string {
  return typeof value === "string" ? value.slice(0, EMBED_MAX_LENGTH) : "";
}

/**
 * The srcdoc for the sandboxed embed frame. No CSP is added (widgets
 * load from their own hosts); isolation comes from the sandbox's opaque
 * origin.
 */
export function embedDocument(code: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;font-family:system-ui,sans-serif}</style></head><body>${code}</body></html>`;
}
