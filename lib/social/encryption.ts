import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SocialProviderError } from "./provider";

function key() {
  const value = process.env.SOCIAL_PROFILE_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new SocialProviderError("not_configured");
  return Buffer.from(value, "hex");
}

export function encryptProfileId(value: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(".");
}

export function decryptProfileId(value: string, context: string): string {
  const encryptionKey = key();
  const parts = /^v1\.([a-f0-9]{24})\.([a-f0-9]{32})\.([a-f0-9]+)$/.exec(value);
  if (!parts || parts[3].length % 2) throw new SocialProviderError("not_configured");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(parts[1], "hex"));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(parts[2], "hex"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "hex")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new SocialProviderError("not_configured");
  }
}
