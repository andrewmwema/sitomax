import { z } from "zod";
import { createSubdomainSchema } from "@/lib/site-creation";
import { businessSchema } from "@/lib/business";

export const GENERATION_PAGE_SLUGS = ["", "about", "services", "contact"] as const;
export const MAX_GENERATION_PAGES = 10;
export const PRESET_PAGES = [
  ["", "Home"], ["about", "About"], ["services", "Services"], ["features", "Features"],
  ["pricing", "Pricing"], ["portfolio", "Examples / Portfolio"], ["faq", "FAQ"], ["team", "Team"],
  ["testimonials", "Testimonials"], ["contact", "Contact"],
] as const;
const reserved = new Set(["home", "api", "dashboard", "login", "signup", "auth", "invite", "editor",
  "forgot-password", "set-password", "s", "_next", "robots", "sitemap", "favicon"]);
export const pageSlugSchema = z.string().max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.")
  .refine((slug) => !reserved.has(slug), "This page address is reserved.");
export const selectedSlugSchema = z.union([z.literal(""), pageSlugSchema]);
export const pageDetailsSchema = z.strictObject({
  slug: pageSlugSchema, name: z.string().trim().min(1).max(80),
  purpose: z.string().trim().min(1).max(180).regex(/^[^\r\n]+$/, "Use one line for the page purpose."),
});
export const extraPageCredits = (count: number) => 2 * Math.max(0, count - 6);
export function slugFromPageName(name: string) {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "");
}
export function selectedPageName(slug: string, details?: { slug: string; name: string }[]) {
  return details?.find((page) => page.slug === slug)?.name ?? PRESET_PAGES.find(([key]) => key === slug)?.[1];
}
export const DESIRED_SECTION_TYPES = ["gallery", "testimonials", "faq", "pricing", "team", "process", "logos"] as const;

export function createGenerationInputSchema(marketingSubdomain?: string, isInternal = false) {
  return z.strictObject({
    accountId: z.uuid(),
    siteId: z.uuid().optional(),
    subdomain: createSubdomainSchema(marketingSubdomain, isInternal).optional(),
    businessName: z.string().trim().min(1).max(100),
    businessType: z.string().trim().min(1).max(100),
    city: z.string().trim().min(1).max(100),
    services: z.array(z.string().trim().min(1).max(80)).max(20),
    audiences: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
    primaryAction: z.enum(["call", "book", "buy", "inquire"]).default("inquire"),
    difference: z.string().trim().max(1000),
    tone: z.string().trim().max(200).default(""),
    openingHours: z.string().trim().max(1000).default(""),
    style: z.enum(["classic", "modern", "auto"]),
    generationMode: z.enum(["catalog", "custom"]).default("catalog"),
    styleDirection: z.enum(["auto", "minimal", "editorial", "bold", "organic", "premium", "playful"]).default("auto"),
    fontDirection: z.enum(["auto", "serif", "sans"]).default("auto"),
    designDescription: z.string().max(5000, "More design guidance must be 5,000 characters or fewer.").default(""),
    desiredPages: z.array(selectedSlugSchema).min(1).max(MAX_GENERATION_PAGES).default([...GENERATION_PAGE_SLUGS]),
    pageDetails: z.array(pageDetailsSchema).max(MAX_GENERATION_PAGES).optional(),
    desiredSections: z.array(z.enum(DESIRED_SECTION_TYPES)).max(DESIRED_SECTION_TYPES.length).default([]),
    primaryColor: z.union([z.literal(""), z.string().regex(/^#[0-9a-f]{6}$/i)]),
    secondaryColor: z.union([z.literal(""), z.string().regex(/^#[0-9a-f]{6}$/i)]),
    phone: z.string().trim().max(40).regex(/^[+0-9(). -]*$/),
    email: z.union([z.literal(""), z.email().max(254)]),
    address: z.string().trim().max(250),
    description: z.string().trim().max(4000).default(""),
    confirmReplace: z.boolean(),
    confirmBusinessUpdate: z.boolean().default(false),
    expectedBusiness: businessSchema.optional(),
  }).superRefine((input, ctx) => {
    if (!input.siteId && !input.subdomain) ctx.addIssue({ code: "custom", path: ["subdomain"], message: "Enter a subdomain." });
    if (new Set(input.desiredPages).size !== input.desiredPages.length) {
      ctx.addIssue({ code: "custom", path: ["desiredPages"], message: "Choose each page only once." });
    }
    if (!input.siteId && !input.desiredPages.includes("")) {
      ctx.addIssue({ code: "custom", path: ["desiredPages"], message: "Home is required." });
    }
    if (new Set(input.pageDetails?.map(({ slug }) => slug)).size !== (input.pageDetails?.length ?? 0)
      || input.pageDetails?.some(({ slug }) => !input.desiredPages.includes(slug))) {
      ctx.addIssue({ code: "custom", path: ["pageDetails"], message: "Custom pages must be selected and use unique addresses." });
    }
    if (new Set(input.desiredSections).size !== input.desiredSections.length) {
      ctx.addIssue({ code: "custom", path: ["desiredSections"], message: "Choose each section type only once." });
    }
  });
}

export const generationInputSchema = createGenerationInputSchema();
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GenerationProgress = { message: string; warnings?: string[]; siteId?: string; generationId?: string };
export const generationOutcomeSchema = z.object({
  slug: z.union([z.literal(""), z.string().max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/)]),
  label: z.string(), pageId: z.uuid().optional(), built: z.boolean(), retryId: z.uuid().optional(),
});
export type GenerationOutcome = z.infer<typeof generationOutcomeSchema>;
export type GenerationResult = { siteId: string; pageId: string; warnings: string[]; pages: GenerationOutcome[] };
