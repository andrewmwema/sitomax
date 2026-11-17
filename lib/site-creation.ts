import { z } from "zod";

export const TEMPLATE_KEYS = ["plumber", "salon", "restaurant", "general-business"] as const;
export const subdomainSchema = z.string().trim().toLowerCase()
  .min(1, "Enter a subdomain.")
  .max(63, "The subdomain must be 63 characters or fewer.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.")
  .refine((value) => value !== "www", "This subdomain is reserved.");

export const siteCreationSchema = z.object({
  accountId: z.uuid(),
  template: z.enum(TEMPLATE_KEYS),
  subdomain: subdomainSchema,
  businessName: z.string().trim().min(1, "Enter a business name.").max(100),
  phone: z.string().trim().min(1, "Enter a phone number.").max(40)
    .regex(/^[+0-9().\s-]+$/, "Enter a valid phone number.")
    .refine((value) => /\d/.test(value), "Enter a valid phone number."),
  city: z.string().trim().min(1, "Enter a city.").max(100),
  services: z.string().trim().min(1, "Describe the services.").max(300),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  address: z.string().trim().min(1, "Enter an address.").max(200),
});

export type SiteCreationInput = z.infer<typeof siteCreationSchema>;
