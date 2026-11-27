import "server-only";

import { ServerClient, Models, Errors } from "postmark";
import type { EmailProvider } from "./index";
import { EmailDeliveryError } from "./errors";

function configuration() {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  const from = process.env.POSTMARK_FROM_EMAIL?.trim();
  return token && from ? { token, from, stream: process.env.POSTMARK_MESSAGE_STREAM?.trim() || "outbound" } : null;
}

function deliveryError(code: number, status: number, detail: string): EmailDeliveryError {
  if (code === 406) return new EmailDeliveryError("The recipient is inactive or bounced. Check their address.", "inactive-recipient");
  if (code === 400 || code === 401 || (code === 300 && /sender signature|sender domain|from address.+(?:verif|confirm)/i.test(detail))) {
    return new EmailDeliveryError("The sender is not verified. Verify the sending address or domain before retrying.");
  }
  if (code === 412 || code === 413) return new EmailDeliveryError("The email account is pending approval or is not approved to send. Check its approval status before retrying.");
  if (code === 10 || status === 401) return new EmailDeliveryError("Email authentication failed. Ask your agency to check the email service credentials.");
  if (code === 1235 || code === 1236) return new EmailDeliveryError("The configured email message stream cannot send. Check the transactional stream settings.");
  return new EmailDeliveryError("Could not send the email. Please try again or contact your agency.");
}

export const postmarkProvider: EmailProvider = {
  isConfigured: () => configuration() !== null,
  async sendEmail(message) {
    const config = configuration();
    if (!config) throw new EmailDeliveryError("Email is not configured. Ask your agency to enable email delivery.");
    const client = new ServerClient(config.token, { timeout: 4 });
    let response: Awaited<ReturnType<ServerClient["sendEmail"]>>;
    try {
      response = await client.sendEmail({
        From: message.from ?? config.from,
        To: typeof message.to === "string" ? message.to : message.to.join(","),
        Subject: message.subject,
        HtmlBody: message.html,
        TextBody: message.text,
        ReplyTo: message.replyTo,
        Bcc: message.bcc,
        Tag: message.tag,
        Metadata: message.metadata,
        MessageStream: message.stream ?? config.stream,
        Attachments: message.attachments?.map((attachment) => ({
          Name: attachment.name, Content: attachment.content, ContentType: attachment.contentType, ContentID: null,
        })),
        TrackOpens: false,
        TrackLinks: Models.LinkTrackingOptions.None,
      });
    } catch (error) {
      const { code, statusCode, message: detail } = error instanceof Errors.PostmarkError
        ? error : { code: 0, statusCode: 0, message: "" };
      console.error("Email provider request failed", { tag: message.tag, code, statusCode });
      throw deliveryError(code, statusCode, detail);
    }
    if (response?.ErrorCode) {
      console.error("Email provider rejected the message", { tag: message.tag, code: response.ErrorCode });
      throw deliveryError(response.ErrorCode, 200, response.Message);
    }
    if (!response?.MessageID || response.ErrorCode !== 0) {
      console.error("Email provider did not acknowledge the message", { tag: message.tag });
      throw new EmailDeliveryError("The email service did not confirm acceptance. Please try again.");
    }
    return { messageId: response.MessageID };
  },
};
