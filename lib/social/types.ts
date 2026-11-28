import { z } from "zod";

export const socialPlatforms = ["facebook", "instagram", "google_business", "linkedin"] as const;
export const platformSchema = z.enum(socialPlatforms);
export type SocialPlatform = z.infer<typeof platformSchema>;
export const platformLabels: Record<SocialPlatform, string> = {
  facebook: "Facebook", instagram: "Instagram", google_business: "Google Business Profile", linkedin: "LinkedIn",
};
export const connectedAccountSchema = z.object({
  platform: platformSchema,
  displayName: z.string().max(500),
  avatarUrl: z.url().nullable(),
  status: z.enum(["connected", "needs_reconnect", "disconnected"]),
});
export type ConnectedAccount = z.infer<typeof connectedAccountSchema>;

export const publishSchema = z.object({
  platforms: z.array(platformSchema).min(1).max(4).refine((value) => new Set(value).size === value.length, "Choose each platform once."),
  text: z.string().trim().min(1).max(63_206),
  perPlatformText: z.object({
    facebook: z.string().max(63_206).optional(), instagram: z.string().max(2200).optional(),
    google_business: z.string().max(1500).optional(), linkedin: z.string().max(3000).optional(),
  }).optional(),
  photoUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Use a public HTTPS image URL.").optional(),
  facebookPageId: z.string().regex(/^\d+$/).optional(),
  googleLocationId: z.string().regex(/^(?:accounts\/\d+\/)?(?:locations\/)?\d+$/).optional(),
  linkedinPageId: z.string().regex(/^\d+$/).optional(),
  requestId: z.uuid(),
}).superRefine((input, ctx) => {
  if (input.platforms.includes("instagram") && !input.photoUrl) {
    ctx.addIssue({ code: "custom", message: "Instagram requires a photo.", path: ["photoUrl"] });
  }
  if (input.platforms.includes("linkedin") && !input.linkedinPageId) {
    ctx.addIssue({ code: "custom", message: "Choose a LinkedIn company Page ID to avoid posting to a personal profile.", path: ["linkedinPageId"] });
  }
  for (const [platform, max] of [["instagram", 2200], ["google_business", 1500], ["linkedin", 3000]] as const) {
    if (input.platforms.includes(platform) && (input.perPlatformText?.[platform] ?? input.text).length > max) {
      ctx.addIssue({ code: "custom", message: `${platformLabels[platform]} text must be at most ${max} characters.`, path: ["text"] });
    }
  }
});
export type SocialPublishInput = z.infer<typeof publishSchema>;
export type PublishReference = { kind: "request" | "job"; id: string };
export type PublishTarget = {
  platform: SocialPlatform;
  status: "pending" | "provider_succeeded" | "failed" | "retryable" | "skipped" | "unknown";
  url: string | null;
  error: string | null;
};
export type SocialReview = {
  id: string; rating: string; comment: string | null; reviewer: string | null; reply: string | null;
};
export type SocialTestResult = {
  error?: string; raw?: unknown; data?: unknown; connectUrl?: string; reference?: PublishReference;
};
