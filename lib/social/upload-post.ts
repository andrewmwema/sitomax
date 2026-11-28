import "server-only";

import { z } from "zod";
import { SocialProviderError, type ProviderLogger, type ProviderResult, type SocialErrorCode, type SocialProvider } from "./provider";
import { platformSchema, publishSchema, socialPlatforms, type ConnectedAccount, type PublishReference, type PublishTarget, type SocialPlatform, type SocialPublishInput } from "./types";
import { redactProviderResponse } from "./redact";

const API = "https://api.upload-post.com";
const successSchema = z.object({ success: z.literal(true) });
const accountSchema = z.object({
  username: z.union([z.string(), z.number()]).optional(),
  display_name: z.string().optional(), handle: z.string().optional(),
  social_images: z.string().nullable().optional(), reauth_required: z.boolean().optional(),
});
const profileSchema = successSchema.extend({
  profile: z.object({ username: z.string(), social_accounts: z.record(z.string(), z.unknown()) }),
});
const referenceSchema = z.object({ kind: z.enum(["request", "job"]), id: z.string().min(1).max(200).regex(/^[\w-]+$/) });
const reviewNameSchema = z.string().regex(/^accounts\/\d+\/locations\/\d+\/reviews\/[^/?#%\s]+$/);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new SocialProviderError("invalid_response", 502, redactProviderResponse(value, process.env.UPLOAD_POST_API_KEY));
  return parsed.data;
}
function errorCode(status: number, data: unknown): SocialErrorCode {
  const parsed = z.object({ error_code: z.string().optional(), outcome_unknown: z.boolean().optional() }).safeParse(data);
  const code = parsed.success ? parsed.data.error_code ?? "" : "";
  if (code === "PROFILE_LIMIT_REACHED") return "profile_limit";
  if ((parsed.success && parsed.data.outcome_unknown) || /outcome_unknown|result_unknown/.test(code)) return "outcome_unknown";
  if (status === 401 || /reconnect|auth.*expired/.test(code)) return "auth_expired";
  if (status === 429) return "rate_limited";
  if (status === 409) return "conflict";
  if (/media|image|photo/i.test(code)) return "media_invalid";
  if (status === 400 || status === 403 || status === 422) return "platform_rejected";
  if (status >= 500) return "unavailable";
  return "unknown";
}
function query(path: string, values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, value);
  return `${path}?${params}`;
}
function publicUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = z.url().safeParse(value);
  if (!parsed.success) return null;
  const url = new URL(parsed.data);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
}

export class UploadPostProvider implements SocialProvider {
  constructor(private readonly logger: ProviderLogger) {}

  private async request<T>(action: string, path: string, schema: z.ZodType<T>, options: {
    method?: string; json?: object; form?: FormData; idempotencyKey?: string;
  } = {}): Promise<ProviderResult<T>> {
    let httpStatus = 0;
    let failure: SocialErrorCode | null = null;
    try {
      const key = process.env.UPLOAD_POST_API_KEY;
      if (!key) throw new SocialProviderError("not_configured");
      const method = options.method ?? "GET";
      let response: Response;
      try {
        response = await fetch(`${API}${path}`, {
          method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
          headers: {
            Authorization: `Apikey ${key}`,
            ...(options.json ? { "Content-Type": "application/json" } : {}),
            ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
          },
          body: options.form ?? (options.json ? JSON.stringify(options.json) : undefined),
        });
      } catch (error) {
        if (!(error instanceof TypeError || error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))) throw error;
        throw new SocialProviderError(method === "GET" ? "unavailable" : "outcome_unknown");
      }
      httpStatus = response.status;
      let raw: unknown;
      try { raw = await response.json(); }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new SocialProviderError("invalid_response", response.status);
      }
      const safeRaw = redactProviderResponse(raw, key);
      if (!response.ok) throw new SocialProviderError(errorCode(response.status, raw), response.status, safeRaw);
      const bodyFailure = z.object({ success: z.literal(false) }).safeParse(raw);
      if (bodyFailure.success) throw new SocialProviderError(errorCode(response.status, raw), response.status, safeRaw);
      return { data: parse(schema, raw), raw: safeRaw };
    } catch (error) {
      if (error instanceof SocialProviderError) failure = error.code;
      else { failure = "unknown"; }
      throw error;
    } finally {
      await this.logger({ action, ok: failure === null, httpStatus, errorCode: failure });
    }
  }

  async createProfile(profileId: string) {
    const username = z.string().min(1).max(100).regex(/^[\w@-]+$/).parse(profileId);
    const result = await this.request("create_profile", "/api/uploadposts/users",
      profileSchema.refine((value) => value.profile.username === username), {
      method: "POST", json: { username },
    });
    return { ...result, data: { providerProfileId: result.data.profile.username } };
  }

  async getConnectUrl(profileId: string, opts: { redirectUrl: string; platforms: SocialPlatform[]; logoUrl: string; title: string; description?: string }) {
    const result = await this.request("connect_url", "/api/uploadposts/users/generate-jwt",
      successSchema.extend({ access_url: z.url(), duration: z.literal("48h") }).refine((value) => {
        const url = new URL(value.access_url);
        return url.origin === "https://app.upload-post.com" && url.pathname === "/connect";
      }), {
        method: "POST", json: {
          username: profileId, redirect_url: z.url().parse(opts.redirectUrl), logo_image: z.url().parse(opts.logoUrl),
          connect_title: z.string().min(1).max(300).parse(opts.title),
          ...(opts.description === undefined ? {} : { connect_description: z.string().min(1).max(300).parse(opts.description) }),
          platforms: z.array(platformSchema).min(1).parse(opts.platforms), show_calendar: false,
        },
      });
    const url = new URL(result.data.access_url);
    return { ...result, data: { url: url.href, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) } };
  }

  async listConnectedAccounts(profileId: string) {
    return this.request("list_accounts", `/api/uploadposts/users/${encodeURIComponent(profileId)}`,
      profileSchema.refine((value) => value.profile.username === profileId).transform((profile) => {
        const accounts: ConnectedAccount[] = [];
        for (const platform of socialPlatforms) {
          const value = profile.profile.social_accounts[platform];
          if (value === undefined || value === null || value === "") continue;
          const account = parse(accountSchema, value);
          if (!account.username && !account.display_name && !account.handle) throw new SocialProviderError("invalid_response", 502);
          accounts.push({
            platform, displayName: account.display_name ?? account.handle ?? String(account.username),
            avatarUrl: publicUrl(account.social_images), status: account.reauth_required ? "needs_reconnect" : "connected",
          });
        }
        return accounts;
      }));
  }

  async publish(profileId: string, input: SocialPublishInput) {
    const parsed = publishSchema.parse(input);
    const form = new FormData();
    form.set("user", profileId);
    form.set("title", parsed.text);
    form.set("async_upload", "true");
    form.set("request_id", parsed.requestId);
    form.set("external_id", parsed.requestId);
    for (const platform of parsed.platforms) form.append("platform[]", platform);
    if (parsed.photoUrl) form.append("photos[]", parsed.photoUrl);
    for (const platform of socialPlatforms) {
      const text = parsed.perPlatformText?.[platform];
      if (text !== undefined) form.set(`${platform}_title`, text);
    }
    if (parsed.facebookPageId) form.set("facebook_page_id", parsed.facebookPageId);
    if (parsed.googleLocationId) form.set("gbp_location_id", parsed.googleLocationId);
    if (parsed.linkedinPageId) form.set("target_linkedin_page_id", parsed.linkedinPageId);
    const result = await this.request("publish", parsed.photoUrl ? "/api/upload_photos" : "/api/upload_text",
      z.object({ request_id: z.string().min(1).max(200) }), {
        method: "POST", form, idempotencyKey: parsed.requestId,
      });
    return { ...result, data: { reference: { kind: "request" as const, id: result.data.request_id } } };
  }

  async getStatus(reference: PublishReference, platforms: SocialPlatform[]) {
    const ref = referenceSchema.parse(reference);
    const result = await this.request("status", query("/api/uploadposts/status", { [`${ref.kind}_id`]: ref.id }),
      z.object({
        status: z.enum(["pending", "queued", "processing", "in_progress", "completed", "failed"]),
        results: z.array(z.object({
          platform: z.string(), status: z.string().optional(), success: z.boolean().optional(),
          skipped: z.boolean().optional(), post_url: z.string().nullable().optional(),
          error_message: z.string().nullable().optional(), error: z.string().optional(),
        })),
      }));
    const targets: PublishTarget[] = platforms.map((platform) => {
      const matches = result.data.results.filter((item) => item.platform === platform);
      if (matches.length > 1) throw new SocialProviderError("invalid_response", 502);
      const item = matches[0];
      let status: PublishTarget["status"] = "unknown";
      if (item?.skipped || item?.status === "skipped") status = "skipped";
      else if (item?.status === "retryable") status = "retryable";
      else if (item?.status === "failed" || item?.success === false) status = "failed";
      else if (item?.status === "queued" || item?.status === "processing") status = "pending";
      else if (item?.status === "completed" || item?.success === true && result.data.status === "completed") status = "provider_succeeded";
      else if (["pending", "queued", "processing", "in_progress"].includes(result.data.status)) status = "pending";
      return { platform, status, url: publicUrl(item?.post_url), error: item?.error_message ?? item?.error ?? null };
    });
    return { ...result, data: targets };
  }

  getHistory(profileId: string, reference: PublishReference) {
    const ref = referenceSchema.parse(reference);
    return this.request("history", query("/api/uploadposts/history", {
      profile_username: profileId, [`${ref.kind}_id`]: ref.id, limit: "10",
    }), z.object({ history: z.array(z.unknown()) }).transform((data) => redactProviderResponse(data, process.env.UPLOAD_POST_API_KEY)));
  }

  async listDestinations(profileId: string) {
    const read = async (path: string) => {
      try {
        const result = await this.request("destinations", query(path, { profile: profileId }), successSchema);
        return { ok: true, response: result.raw };
      } catch (error) {
        if (!(error instanceof SocialProviderError)) throw error;
        return { ok: false, error: error.message, response: error.raw };
      }
    };
    const [facebook, google] = await Promise.all([
      read("/api/uploadposts/facebook/pages"), read("/api/uploadposts/google-business/locations"),
    ]);
    return { data: { facebook, google }, raw: { facebook, google } };
  }

  getGooglePost(profileId: string, postId: string) {
    z.string().regex(/^accounts\/\d+\/locations\/\d+\/localPosts\/[^/?#%\s]+$/).parse(postId);
    return this.request("google_post", query("/api/uploadposts/google-business/posts/get", { user: profileId, post_id: postId }),
      successSchema.extend({ state: z.string() }));
  }

  async listGoogleReviews(profileId: string, opts: { pageSize?: number; pageToken?: string; locationId?: string } = {}) {
    const result = await this.request("list_reviews", query("/api/uploadposts/google-business/reviews", {
      user: profileId, pageSize: String(z.number().int().min(1).max(50).parse(opts.pageSize ?? 20)),
      pageToken: opts.pageToken, location_id: opts.locationId,
    }), successSchema.extend({
      reviews: z.array(z.object({
        name: reviewNameSchema, starRating: z.string(), comment: z.string().optional(),
        reviewer: z.object({ displayName: z.string().optional() }).optional(),
        reviewReply: z.object({ comment: z.string().optional() }).optional(),
      })),
      nextPageToken: z.string().optional(),
    }));
    return { ...result, data: {
      reviews: result.data.reviews.map((review) => ({
        id: review.name, rating: review.starRating, comment: review.comment ?? null,
        reviewer: review.reviewer?.displayName ?? null, reply: review.reviewReply?.comment ?? null,
      })), nextPageToken: result.data.nextPageToken,
    } };
  }

  async replyToGoogleReview(profileId: string, reviewId: string, comment: string) {
    const text = z.string().trim().min(1).refine((value) => Buffer.byteLength(value, "utf8") <= 4096, "Reply must be at most 4096 UTF-8 bytes.").parse(comment);
    const result = await this.request("reply_review", "/api/uploadposts/google-business/reviews/reply", successSchema, {
      method: "PUT", json: { user: profileId, review_name: reviewNameSchema.parse(reviewId), comment: text },
    });
    return { ...result, data: undefined };
  }

  async deleteProfile(profileId: string) {
    const result = await this.request("delete_profile", "/api/uploadposts/users", successSchema, { method: "DELETE", json: { username: profileId } });
    return { ...result, data: undefined };
  }
}
