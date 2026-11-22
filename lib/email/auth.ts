import "server-only";

import { brand } from "@/lib/brand";
import { renderPasswordEmail } from "@/emails/registry";

export function passwordSetupUrl(type: "invite" | "recovery", tokenHash: string): URL {
  const url = new URL("/auth/callback", brand.appUrl);
  url.searchParams.set("next", "/set-password");
  url.searchParams.set("type", type);
  url.searchParams.set("token_hash", tokenHash);
  return url;
}

export async function passwordEmail(type: "invite" | "recovery", tokenHash: string) {
  return renderPasswordEmail(type, passwordSetupUrl(type, tokenHash).href);
}
