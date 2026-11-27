import { timingSafeEqual } from "node:crypto";
import { processGraderNotifications } from "@/lib/grader/notification";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processGraderNotifications();
    return Response.json(result, { status: result.failures ? 500 : 200 });
  } catch {
    console.error("Could not process grader notification jobs");
    return Response.json({ error: "Grader notifications are unavailable." }, { status: 503 });
  }
}
