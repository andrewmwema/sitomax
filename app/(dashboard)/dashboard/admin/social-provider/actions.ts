"use server";

import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { connectSocialAccount, socialContext, socialUserError, syncSocialAccount } from "@/lib/social/connections";
import { SocialProviderError } from "@/lib/social/provider";
import { platformSchema, publishSchema, type SocialTestResult } from "@/lib/social/types";
import { redactProviderResponse } from "@/lib/social/redact";

const ref = z.object({ kind: z.enum(["request", "job"]), id: z.string().regex(/^[\w-]{1,200}$/) });
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect") }),
  z.object({ action: z.literal("accounts") }),
  z.object({ action: z.literal("destinations") }),
  z.object({ action: z.literal("publish"), input: publishSchema, confirm: z.literal(true) }),
  z.object({ action: z.literal("status"), reference: ref, platforms: z.array(platformSchema).min(1).max(4) }),
  z.object({ action: z.literal("google_post"), postId: z.string().min(1).max(500) }),
  z.object({ action: z.literal("reviews"), pageToken: z.string().max(2000).optional(), locationId: z.string().max(200).optional() }),
  z.object({ action: z.literal("reply"), reviewId: z.string().max(500), comment: z.string().max(4096), confirm: z.literal(true) }),
]);

export async function runSocialProviderTest(siteId: string, input: unknown): Promise<SocialTestResult> {
  const { supabase } = await requireSuperAdmin();
  try {
    z.uuid().parse(siteId);
    const parsed = inputSchema.parse(input);
    const site = await supabase.from("sites").select("account_id").eq("id", siteId).maybeSingle();
    if (site.error || !site.data) return { error: "Could not load the selected site." };
    const accountId = z.uuid().parse(site.data.account_id);
    if (parsed.action === "connect") {
      const result = await connectSocialAccount(accountId);
      return { connectUrl: result.data.url, raw: result.raw };
    }
    if (parsed.action === "accounts") {
      const result = await syncSocialAccount(accountId);
      return { data: result.data, raw: result.raw };
    }
    const context = await socialContext(accountId);
    if (!context.profile.encrypted_provider_profile_id) return { error: "Open the connect link and connect accounts first." };
    const { provider, username } = context;
    switch (parsed.action) {
      case "destinations": {
        const result = await provider.listDestinations(username);
        return { data: result.data, raw: result.raw };
      }
      case "publish": {
        const result = await provider.publish(username, parsed.input);
        return { data: result.data, raw: result.raw, reference: result.data.reference };
      }
      case "status": {
        const status = await provider.getStatus(parsed.reference, parsed.platforms);
        const history = await provider.getHistory(username, parsed.reference);
        return { data: redactProviderResponse(status.data, process.env.UPLOAD_POST_API_KEY), raw: { status: status.raw, history: history.raw } };
      }
      case "google_post": {
        const result = await provider.getGooglePost(username, parsed.postId);
        return { data: result.data, raw: result.raw };
      }
      case "reviews": {
        const result = await provider.listGoogleReviews(username, {
          pageToken: parsed.pageToken, locationId: parsed.locationId,
        });
        return { data: result.data, raw: result.raw };
      }
      case "reply": {
        const result = await provider.replyToGoogleReview(username, parsed.reviewId, parsed.comment);
        return { raw: result.raw };
      }
    }
  } catch (error) {
    return { error: socialUserError(error), ...(error instanceof SocialProviderError ? { raw: error.raw } : {}) };
  }
}
