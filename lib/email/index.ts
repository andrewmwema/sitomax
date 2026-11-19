import "server-only";

import { postmarkProvider } from "./postmark";
export { EmailDeliveryError } from "./errors";

export type EmailMessage = {
  to: string | readonly string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tag: "invite" | "domain" | "form-notification" | "password-reset";
  metadata?: Record<string, string>;
};

export interface EmailProvider {
  isConfigured(): boolean;
  sendEmail(message: EmailMessage): Promise<void>;
}

export function isEmailConfigured(): boolean {
  return postmarkProvider.isConfigured();
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  return postmarkProvider.sendEmail(message);
}
