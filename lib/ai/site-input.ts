import { z } from "zod";
import { subdomainSchema } from "@/lib/site-creation";

export const generationInputSchema = z.strictObject({
  accountId: z.uuid(),
  siteId: z.uuid().optional(),
  subdomain: subdomainSchema.optional(),
  businessName: z.string().trim().min(1).max(100),
  businessType: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  services: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  difference: z.string().trim().max(1000),
  tone: z.string().trim().max(200).default(""),
  openingHours: z.string().trim().max(1000).default(""),
  style: z.enum(["classic", "modern", "auto"]),
  primaryColor: z.union([z.literal(""), z.string().regex(/^#[0-9a-f]{6}$/i)]),
  secondaryColor: z.union([z.literal(""), z.string().regex(/^#[0-9a-f]{6}$/i)]),
  phone: z.string().trim().max(40).regex(/^[+0-9(). -]*$/),
  email: z.union([z.literal(""), z.email().max(254)]),
  address: z.string().trim().max(250),
  description: z.string().trim().max(4000),
  confirmReplace: z.boolean(),
}).superRefine((input, ctx) => {
  if (!input.siteId && !input.subdomain) ctx.addIssue({ code: "custom", path: ["subdomain"], message: "Enter a subdomain." });
  if (input.siteId && !input.confirmReplace) ctx.addIssue({ code: "custom", path: ["confirmReplace"], message: "Confirm replacement of the current drafts." });
});

export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GenerationProgress = { message: string; warnings?: string[] };
export type GenerationResult = { siteId: string; pageId: string; warnings: string[] };
