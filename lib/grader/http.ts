import { z } from "zod";
import { brand } from "@/lib/brand";

export function allowedGraderOrigins() {
  const app = new URL(brand.appUrl);
  return new Set([app.origin, `${app.protocol}//${process.env.ROOT_DOMAIN ?? brand.rootDomain}`]);
}

export function graderHeaders(request: Request): Headers | null {
  const origin = request.headers.get("origin");
  if (origin && !allowedGraderOrigins().has(origin)) return null;
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return headers;
}

const verificationSchema = z.object({ success: z.boolean(), hostname: z.string().optional() });

export async function verifyTurnstile(token: string, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("Grader Turnstile secret is not configured");
    return false;
  }
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (!response.ok) {
      console.error("Turnstile verification failed", { status: response.status });
      return false;
    }
    const result = verificationSchema.safeParse(await response.json());
    if (!result.success || !result.data.success || !result.data.hostname) return false;
    const hostname = result.data.hostname.toLowerCase();
    if (process.env.NODE_ENV === "development" && hostname === "example.com"
      && secret === "1x0000000000000000000000000000000AA") return true;
    return [...allowedGraderOrigins()].some((origin) => new URL(origin).hostname === hostname);
  } catch {
    console.error("Turnstile verification could not be completed");
    return false;
  }
}
