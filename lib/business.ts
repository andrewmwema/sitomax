import { z } from "zod";
import { normalizeExternalUrl } from "@/lib/links";

export const businessSchema = z.strictObject({
  businessName: z.string().trim().max(100),
  businessType: z.string().trim().max(100),
  city: z.string().trim().max(100),
  services: z.array(z.string().trim().min(1).max(80)).max(20),
  difference: z.string().trim().max(1000),
  tone: z.string().trim().max(200),
  phone: z.string().trim().max(40).regex(/^[+0-9(). -]*$/),
  email: z.union([z.literal(""), z.email().max(254)]),
  address: z.string().trim().max(250),
  openingHours: z.string().trim().max(1000),
  primaryAction: z.enum(["call", "book", "buy", "inquire"]).optional(),
  audiences: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  description: z.string().trim().max(4000).optional(),
  socialLinks: z.array(z.strictObject({
    label: z.string().trim().min(1).max(40),
    url: z.string().max(2000).refine(value => normalizeExternalUrl(value) !== null, "Enter a valid social profile URL."),
  })).max(8).optional(),
});

export const businessIntakeSchema = businessSchema.omit({ socialLinks: true }).extend({
  primaryAction: businessSchema.shape.primaryAction.unwrap().default("inquire"),
  audiences: businessSchema.shape.audiences.unwrap().default([]),
  description: businessSchema.shape.description.unwrap().default(""),
});

export const templateBusinessIntakeSchema = businessIntakeSchema.extend({
  businessName: businessSchema.shape.businessName.min(1, "Enter a business name."),
  businessType: businessSchema.shape.businessType.min(1, "Describe what the business does."),
  city: businessSchema.shape.city.min(1, "Enter a location or service area."),
});

export type Business = z.infer<typeof businessSchema>;

export const emptyBusiness: Business = {
  businessName: "", businessType: "", city: "", services: [], difference: "",
  tone: "", phone: "", email: "", address: "", openingHours: "",
};
