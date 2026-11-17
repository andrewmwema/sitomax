import { z } from "zod";

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
});

export type Business = z.infer<typeof businessSchema>;

export const emptyBusiness: Business = {
  businessName: "", businessType: "", city: "", services: [], difference: "",
  tone: "", phone: "", email: "", address: "", openingHours: "",
};
