import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { brand } from "@/lib/brand";

function secret() {
  const value = process.env.GRADER_UNSUBSCRIBE_SECRET;
  if (!value || value.length < 32) throw new Error("Grader unsubscribe secret is not configured.");
  return value;
}

export function unsubscribeUrl(unlockId: string) {
  const id = z.uuid().parse(unlockId);
  const signature = createHmac("sha256", secret()).update(id).digest("base64url");
  const url = new URL("/api/grader/unsubscribe", brand.appUrl);
  url.searchParams.set("token", `${id}.${signature}`);
  return url.href;
}

export function verifyUnsubscribeToken(token: string | null): string | null {
  const key = secret();
  const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
  if (!match || !z.uuid().safeParse(match[1]).success) return null;
  const expected = createHmac("sha256", key).update(match[1]).digest();
  const actual = Buffer.from(match[2], "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? match[1] : null;
}
