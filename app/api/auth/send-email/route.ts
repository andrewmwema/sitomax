import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { EmailDeliveryError, sendEmail } from "@/lib/email";
import { passwordEmail } from "@/lib/email/auth";
import { readTextBody } from "@/lib/request-body";

const recoveryPayload = z.object({
  user: z.object({ email: z.email() }),
  email_data: z.object({
    email_action_type: z.literal("recovery"),
    token_hash: z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/),
  }),
});

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET?.trim();
  if (!secret) {
    console.error("Password reset email hook is not configured");
    return Response.json({ error: "Email hook not configured." }, { status: 503 });
  }
  const body = await readTextBody(request, 32_768);
  if (body === null) return Response.json({ error: "Request too large." }, { status: 413 });

  let payload: unknown;
  try {
    payload = new Webhook(secret.replace(/^v1,/, "")).verify(body, Object.fromEntries(request.headers));
  } catch {
    return Response.json({ error: "Invalid email hook signature." }, { status: 401 });
  }
  const parsed = recoveryPayload.safeParse(payload);
  if (!parsed.success) {
    console.error("Unsupported or invalid Auth email hook event");
    return Response.json({ error: "Unsupported or invalid email event." }, { status: 400 });
  }
  try {
    await sendEmail({
      to: parsed.data.user.email,
      subject: "Reset your password",
      tag: "password-reset",
      ...passwordEmail("recovery", parsed.data.email_data.token_hash),
    });
    return Response.json({});
  } catch (error) {
    console.error("Password reset email failed", {
      reason: error instanceof EmailDeliveryError ? error.message : "Unexpected email error.",
    });
    return Response.json({ error: "Could not send password reset email." }, { status: 502 });
  }
}
