export const brand = {
  name: process.env.NEXT_PUBLIC_AGENCY_NAME ?? "SitoMax",
  tagline: "Websites that work as hard as you do",
  supportEmail: "support@sitomax.com",
  rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "sitomax.com",
} as const;
