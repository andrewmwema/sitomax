import { render } from "@react-email/render";

const template = (kind) => {
  const body = kind === "reply"
    ? "<p>Thanks for your inquiry.</p><p>Regards,<br>Acme</p>"
    : "<p>A new inquiry was saved for Acme.</p><p><a href=\"https://app.example.test/dashboard/forms?lead=lead-id\">View lead</a></p>";
  return `<html><body>${body}</body></html>`;
};

async function sendWithMockedTransport(kind) {
  const html = await render(template(kind));
  const text = await render(template(kind), { plainText: true });
  const secret = process.env.LEAD_WORKER_SECRET;
  if (!secret || secret.length < 32) throw new Error("LEAD_WORKER_SECRET is missing or invalid");
  const mockedRpc = async (name) => {
    if (name === "reserve_lead_reply") return { data: "reserved", error: null };
    if (name === "finish_lead_reply") return { data: true, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  };
  await mockedRpc("reserve_lead_reply");
  const response = await Promise.resolve({
    ErrorCode: 300,
    Message: "Sender signature not confirmed",
  });
  await mockedRpc("finish_lead_reply");
  return { kind, html, text, providerCode: response.ErrorCode, providerMessage: response.Message };
}

const secret = "01234567890123456789012345678901";
process.env.LEAD_WORKER_SECRET = secret;

for (const kind of ["reply", "new-lead"]) {
  const result = await sendWithMockedTransport(kind);
  console.log(JSON.stringify({
    kind: result.kind,
    htmlRendered: Boolean(result.html),
    textRendered: Boolean(result.text),
    realError: `Postmark error ${result.providerCode}: ${result.providerMessage}`,
  }, null, 2));
}
