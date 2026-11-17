import { businessSchema, emptyBusiness } from "@/lib/business";
import { absoluteImage, isNoindex, pageSeoSchema, siteSeoSchema } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";
import type { TenantPage, TenantSite } from "@/lib/tenant";

export function parseSiteSeo(site: TenantSite) {
  const result = siteSeoSchema.safeParse(site.seo ?? {});
  if (!result.success) {
    console.error("Invalid site SEO configuration", { siteId: site.id });
    throw new Error("Invalid site SEO configuration.");
  }
  return result.data;
}

export function parsePageSeo(value: unknown) {
  const result = pageSeoSchema.safeParse(value ?? {});
  if (!result.success) {
    console.error("Invalid page SEO configuration.");
    throw new Error("Invalid page SEO configuration.");
  }
  return result.data;
}

export function canonicalUrl(site: TenantSite, slug: string) {
  const path = slug ? `/${slug.split("/").map(encodeURIComponent).join("/")}` : "/";
  return `${getSiteUrl(site)}${path}`;
}

export function publicPageSeo(site: TenantSite, page: Pick<TenantPage, "title" | "slug" | "seo">) {
  const settings = parseSiteSeo(site);
  const seo = parsePageSeo(page.seo);
  const siteUrl = getSiteUrl(site);
  return {
    title: seo.title?.trim() || page.title || site.name || site.subdomain,
    description: seo.description?.trim() || undefined,
    image: absoluteImage(seo.image || settings.socialImage, siteUrl),
    noindex: isNoindex(seo, settings),
    canonical: canonicalUrl(site, page.slug),
    verification: settings.googleVerification,
  };
}

export function localBusinessJsonLd(site: TenantSite) {
  const business = businessSchema.parse({ ...emptyBusiness, ...site.business });
  const category = business.businessType.toLowerCase().replace(/[^a-z]/g, "");
  const schemaType: Record<string, string> = {
    plumber: "Plumber", plumbing: "Plumber", hairsalon: "HairSalon", salon: "HairSalon",
    restaurant: "Restaurant", dentist: "Dentist", electrician: "Electrician",
    roofingcontractor: "RoofingContractor", realestateagent: "RealEstateAgent",
    automotivebusiness: "AutomotiveBusiness",
  };
  const url = getSiteUrl(site);
  const logo = typeof site.theme?.logoUrl === "string" ? absoluteImage(site.theme.logoUrl, url) : undefined;
  return {
    "@context": "https://schema.org", "@type": schemaType[category] ?? "LocalBusiness",
    name: business.businessName || site.name || site.subdomain, url,
    ...(business.address ? { address: { "@type": "PostalAddress", streetAddress: business.address } } : {}),
    ...(business.city ? { areaServed: business.city } : {}),
    ...(business.phone ? { telephone: business.phone } : {}),
    ...(business.openingHours ? { openingHours: business.openingHours } : {}),
    ...(logo ? { logo } : {}),
  };
}
