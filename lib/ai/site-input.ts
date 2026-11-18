import { z } from "zod";
import { createSubdomainSchema } from "@/lib/site-creation";

export const GENERATION_PAGE_SLUGS = ["", "about", "services", "contact"] as const;
export const DESIRED_SECTION_TYPES = ["gallery", "testimonials", "faq", "pricing", "team", "process", "logos"] as const;

export function createGenerationInputSchema(marketingSubdomain?: string, isInternal = false) {
  return z.strictObject({
    accountId: z.uuid(),
    siteId: z.uuid().optional(),
    subdomain: createSubdomainSchema(marketingSubdomain, isInternal).optional(),
    businessName: z.string().trim().min(1).max(100),
    businessType: z.string().trim().min(1).max(100),
    city: z.string().trim().min(1).max(100),
    services: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    difference: z.string().trim().max(1000),
    tone: z.string().trim().max(200).default(""),
    openingHours: z.string().trim().max(1000).default(""),
    style: z.enum(["classic", "modern", "auto"]),
    generationMode: z.enum(["catalog", "custom"]).default("catalog"),
    styleDirection: z.enum(["auto", "minimal", "editorial", "bold", "organic", "premium", "playful"]).default("auto"),
    fontDirection: z.enum(["auto", "serif", "sans"]).default("auto"),
    designDescription: z.string().max(5000, "More design guidance must be 5,000 characters or fewer.").default(""),
    desiredPages: z.array(z.enum(GENERATION_PAGE_SLUGS)).min(1).max(4).default([...GENERATION_PAGE_SLUGS]),
    desiredSections: z.array(z.enum(DESIRED_SECTION_TYPES)).max(DESIRED_SECTION_TYPES.length).default([]),
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
    if (new Set(input.desiredPages).size !== input.desiredPages.length) {
      ctx.addIssue({ code: "custom", path: ["desiredPages"], message: "Choose each page only once." });
    }
    if (!input.desiredPages.includes("")) {
      ctx.addIssue({ code: "custom", path: ["desiredPages"], message: "Home is required." });
    }
    if (new Set(input.desiredSections).size !== input.desiredSections.length) {
      ctx.addIssue({ code: "custom", path: ["desiredSections"], message: "Choose each section type only once." });
    }
  });
}

export const generationInputSchema = createGenerationInputSchema();
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GenerationProgress = { message: string; warnings?: string[] };
export type GenerationResult = { siteId: string; pageId: string; warnings: string[] };
