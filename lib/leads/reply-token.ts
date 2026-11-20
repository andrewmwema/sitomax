import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function equalSecret(actual: string, expected: string) {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(actual), hash(expected));
}

export function safeMailDomain(raw: string | undefined) {
  const value = raw?.trim().toLowerCase();
  return value && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(value) ? value : null;
}

function token(id: string, secret: string) {
  return createHmac("sha256", secret).update(`lead-reply:${id}`).digest("base64url").slice(0, 20);
}

export function replyAddress(id: string, domain: string, secret: string) {
  // 6 + 36 + 1 + 20 = 63 characters, within the SMTP local-part limit.
  return `reply+${id}.${token(id, secret)}@${domain}`;
}

export function verifyReplyAddress(raw: string, domain: string, secret: string, allowMailboxHash = false) {
  let local = raw;
  if (raw.includes("@")) {
    const [part, host, trailing] = raw.trim().split("@");
    if (trailing !== undefined || host.toLowerCase() !== domain) return null;
    local = part;
    if (!local.startsWith("reply+")) return null;
  } else if (!allowMailboxHash) return null;
  const match = /^(?:reply\+)?([0-9a-f-]{36})\.([A-Za-z0-9_-]{20})$/.exec(local);
  if (!match || !z.uuid().safeParse(match[1]).success || !equalSecret(match[2], token(match[1], secret))) return null;
  return match[1];
}
