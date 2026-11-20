import "server-only";

import { postmarkProvider } from "./postmark";
export { EmailDeliveryError } from "./errors";

export type EmailMessage = {
  to: string | readonly string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  bcc?: string;
  from?: string;
  stream?: string;
  tag: "invite" | "domain" | "form-notification" | "password-reset" | "lead-reply" | "lead-forward";
  metadata?: Record<string, string>;
};

export interface EmailProvider {
  isConfigured(): boolean;
  sendEmail(message: EmailMessage): Promise<{ messageId: string }>;
}

export function isEmailConfigured(): boolean {
  return postmarkProvider.isConfigured();
}

export async function sendEmail(message: EmailMessage) {
  return postmarkProvider.sendEmail(message);
}
