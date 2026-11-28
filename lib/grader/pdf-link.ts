import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const GRADER_PDF_LINK_TTL_SECONDS = 24 * 60 * 60;

// Derived from the worker secret so share links need no extra configuration.
function signingKey(): Buffer | null {
  const secret = process.env.GRADER_WORKER_SECRET;
  if (!secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update("grader-pdf-link:v1").digest();
}

function signature(key: Buffer, slug: string, expires: number) {
  return createHmac("sha256", key).update(`${slug}.${expires}`).digest("base64url");
}

/** Builds a same-host, expiring download path for a shared report PDF. */
export function signedGraderPdfPath(slug: string, now = Date.now()): string | null {
  const key = signingKey();
  if (!key) return null;
  const expires = Math.floor(now / 1000) + GRADER_PDF_LINK_TTL_SECONDS;
  const params = new URLSearchParams({ expires: String(expires), sig: signature(key, slug, expires) });
  return `/grade/${encodeURIComponent(slug)}/pdf?${params}`;
}

export function verifyGraderPdfLink(slug: string, expiresValue: string | null, sig: string | null, now = Date.now()): boolean {
  const key = signingKey();
  if (!key || !expiresValue || !sig || !/^\d{1,12}$/.test(expiresValue)) return false;
  const expires = Number(expiresValue);
  if (expires * 1000 < now || expires * 1000 > now + GRADER_PDF_LINK_TTL_SECONDS * 1000 + 60_000) return false;
  const expected = Buffer.from(signature(key, slug, expires));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
