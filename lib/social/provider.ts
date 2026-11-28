import "server-only";

import { UploadPostProvider } from "./upload-post";
import type { ConnectedAccount, PublishReference, PublishTarget, SocialPlatform, SocialPublishInput, SocialReview } from "./types";

export type ProviderResult<T> = { data: T; raw: unknown };
export type SocialErrorCode = "not_configured" | "profile_limit" | "auth_expired" | "rate_limited" | "media_invalid" |
  "platform_rejected" | "unavailable" | "outcome_unknown" | "invalid_response" | "conflict" | "unknown";
export class SocialProviderError extends Error {
  constructor(
    public readonly code: SocialErrorCode,
    public readonly status = 0,
    public readonly raw: unknown = null,
  ) {
    super({
      not_configured: "Social connections are not configured. Contact your agency.",
      profile_limit: "The social profile limit was reached. Ask your agency to free a profile slot or upgrade.",
      auth_expired: "The connection needs attention. Reconnect the account or ask your agency to check the configuration.",
      rate_limited: "The social service is busy or a usage limit was reached. Wait before trying again.",
      media_invalid: "The image was not accepted. Check its format, size and public URL.",
      platform_rejected: "The platform rejected this request. Check the destination and content.",
      unavailable: "The social service is temporarily unavailable.",
      outcome_unknown: "The outcome is unknown. Check status before sending again to avoid duplicates.",
      invalid_response: "The social service returned an unexpected response. Contact your agency.",
      conflict: "The profile or request already exists. Check its status before trying again.",
      unknown: "The social service could not complete the request.",
    }[code]);
    this.name = "SocialProviderError";
  }
}
export type ProviderAudit = {
  action: string; ok: boolean; httpStatus: number; errorCode: SocialErrorCode | null;
};
export type ProviderLogger = (event: ProviderAudit) => Promise<void>;
export interface SocialProvider {
  createProfile(profileId: string): Promise<ProviderResult<{ providerProfileId: string }>>;
  getConnectUrl(profileId: string, opts: {
    redirectUrl: string; platforms: SocialPlatform[]; logoUrl: string; title: string;
  }): Promise<ProviderResult<{ url: string; expiresAt: Date }>>;
  listConnectedAccounts(profileId: string): Promise<ProviderResult<ConnectedAccount[]>>;
  publish(profileId: string, input: SocialPublishInput): Promise<ProviderResult<{ reference: PublishReference }>>;
  getStatus(reference: PublishReference, platforms: SocialPlatform[]): Promise<ProviderResult<PublishTarget[]>>;
  getHistory(profileId: string, reference: PublishReference): Promise<ProviderResult<unknown>>;
  listDestinations(profileId: string): Promise<ProviderResult<unknown>>;
  getGooglePost(profileId: string, postId: string): Promise<ProviderResult<unknown>>;
  listGoogleReviews(profileId: string, opts?: {
    pageSize?: number; pageToken?: string; locationId?: string;
  }): Promise<ProviderResult<{ reviews: SocialReview[]; nextPageToken?: string }>>;
  replyToGoogleReview(profileId: string, reviewId: string, comment: string): Promise<ProviderResult<void>>;
  deleteProfile(profileId: string): Promise<ProviderResult<void>>;
}

export function getSocialProvider(logger: ProviderLogger): SocialProvider {
  return new UploadPostProvider(logger);
}
