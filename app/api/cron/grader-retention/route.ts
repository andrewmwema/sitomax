import { timingSafeEqual } from "node:crypto";
import { processGraderRetention } from "@/lib/grader/retention";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processGraderRetention();
    return Response.json(result, { status: result.failures ? 500 : 200 });
  } catch {
    console.error("Could not run grader retention");
    return Response.json({ error: "Grader retention is unavailable." }, { status: 503 });
  }
}
