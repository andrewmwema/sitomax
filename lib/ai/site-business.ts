import { businessSchema, type Business } from "@/lib/business";

export function generationBusiness(input: Omit<Business, "socialLinks">, saved?: Business): Business {
  const { businessName, businessType, city, services, difference, tone, phone, email, address, openingHours } = input;
  return businessSchema.parse({
    businessName, businessType, city, services, difference, tone, phone, email, address, openingHours,
    ...(saved?.socialLinks ? { socialLinks: saved.socialLinks } : {}),
  });
}

export function businessDetailsChanged(input: Omit<Business, "socialLinks">, saved: Business) {
  return JSON.stringify(generationBusiness(input)) !== JSON.stringify(generationBusiness(saved));
}
