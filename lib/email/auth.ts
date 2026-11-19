import "server-only";

import { brand } from "@/lib/brand";
import { emailBody } from "./message";

export function passwordSetupUrl(type: "invite" | "recovery", tokenHash: string): URL {
  const url = new URL("/auth/callback", brand.appUrl);
  url.searchParams.set("next", "/set-password");
  url.searchParams.set("type", type);
  url.searchParams.set("token_hash", tokenHash);
  return url;
}

export function passwordEmail(type: "invite" | "recovery", tokenHash: string) {
  const invite = type === "invite";
  return emailBody(
    invite
      ? `You've been invited to manage a website on ${brand.name}. Set your password to accept your invitation.`
      : `We received a request to reset your ${brand.name} password. If you did not request this, you can ignore this email.`,
    {
      label: invite ? "Accept invitation" : "Reset password",
      url: passwordSetupUrl(type, tokenHash).href,
    },
  );
}
