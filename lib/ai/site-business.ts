import { businessSchema, type Business } from "@/lib/business";

export function generationBusiness(input: Omit<Business, "socialLinks">, saved?: Business): Business {
  const { businessName, businessType, city, services, difference, tone, phone, email, address, openingHours,
    primaryAction, audiences, description } = input;
  return businessSchema.parse({
    businessName, businessType, city, services, difference, tone, phone, email, address, openingHours,
    ...((primaryAction ?? saved?.primaryAction) !== undefined ? { primaryAction: primaryAction ?? saved?.primaryAction } : {}),
    ...((audiences ?? saved?.audiences) !== undefined ? { audiences: audiences ?? saved?.audiences } : {}),
    ...((description ?? saved?.description) !== undefined ? { description: description ?? saved?.description } : {}),
    ...(saved?.socialLinks ? { socialLinks: saved.socialLinks } : {}),
  });
}

export function businessDetailsChanged(input: Omit<Business, "socialLinks">, saved: Business) {
  return JSON.stringify(generationBusiness(input)) !== JSON.stringify(generationBusiness(saved));
}
