import { z } from "zod";

const platformSchema = z.enum(["facebook", "instagram", "google_business"]);
type Platform = z.infer<typeof platformSchema>;

const uploadSchema = z.object({
  profile: z.string().min(1),
  platforms: z.array(platformSchema).min(1).refine(
    (platforms) => new Set(platforms).size === platforms.length,
    "Platforms must be unique",
  ),
  text: z.string().min(1),
  photos: z.array(z.url().refine((url) => new URL(url).protocol === "https:")),
  requestId: z.string().min(1),
  externalId: z.string().min(1).max(255),
  facebookPageId: z.string().min(1).optional(),
  googleLocationId: z.string().min(1).optional(),
}).refine(
  (input) => input.photos.length > 0 || !input.platforms.includes("instagram"),
  "Instagram requires media",
);

export function buildOfflineUpload(input: z.input<typeof uploadSchema>) {
  const parsed = uploadSchema.parse(input);
  const form = new FormData();
  form.set("user", parsed.profile);
  for (const platform of parsed.platforms) form.append("platform[]", platform);
  for (const photo of parsed.photos) form.append("photos[]", photo);
  form.set("title", parsed.text);
  form.set("request_id", parsed.requestId);
  form.set("external_id", parsed.externalId);
  form.set("async_upload", "true");
  if (parsed.facebookPageId) form.set("facebook_page_id", parsed.facebookPageId);
  if (parsed.googleLocationId) form.set("gbp_location_id", parsed.googleLocationId);

  return {
    path: parsed.photos.length ? "/api/upload_photos" : "/api/upload_text",
    form,
  };
}

const statusSchema = z.object({
  status: z.enum(["pending", "queued", "processing", "in_progress", "completed", "failed"]),
  results: z.array(z.object({
    platform: platformSchema,
    status: z.enum(["queued", "processing", "completed", "failed", "retryable", "skipped"]).optional(),
    success: z.boolean().optional(),
    skipped: z.boolean().optional(),
    post_url: z.string().nullable().optional(),
  })),
});

type OfflineOutcome = {
  platform: Platform;
  state: "pending" | "provider_succeeded" | "failed" | "retryable" | "skipped" | "unknown";
  postUrl: string | null;
};

export function interpretOfflineStatus(
  targets: Platform[],
  response: unknown,
): OfflineOutcome[] {
  const parsed = statusSchema.parse(response);
  const platforms = new Set(parsed.results.map((result) => result.platform));
  if (platforms.size !== parsed.results.length || parsed.results.some((result) => !targets.includes(result.platform))) {
    throw new Error("Status contains duplicate or unexpected platforms");
  }

  return targets.map((platform) => {
    const result = parsed.results.find((item) => item.platform === platform);
    let state: OfflineOutcome["state"] = "unknown";
    if (result?.skipped || result?.status === "skipped") state = "skipped";
    else if (result?.status === "retryable") state = "retryable";
    else if (result?.status === "failed" || result?.success === false) state = "failed";
    else if (result?.status === "queued" || result?.status === "processing") state = "pending";
    else if (result?.status === "completed" || (result?.success === true && parsed.status === "completed")) state = "provider_succeeded";
    else if (["pending", "queued", "processing", "in_progress"].includes(parsed.status)) state = "pending";
    return { platform, state, postUrl: result?.post_url ?? null };
  });
}
