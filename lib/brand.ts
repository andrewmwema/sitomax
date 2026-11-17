const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "sitomax.com";
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? (
  rootDomain.includes("localhost")
    ? `http://${rootDomain}`
    : `https://app.${rootDomain}`
)).replace(/\/+$/, "");

export const brand = {
  name: process.env.NEXT_PUBLIC_AGENCY_NAME ?? "SitoMax",
  tagline: "Websites that work as hard as you do",
  supportEmail: "support@sitomax.com",
  rootDomain,
  appUrl,
  marketingSiteSubdomain: (process.env.MARKETING_SITE_SUBDOMAIN ?? "sitomax").trim().toLowerCase(),
} as const;
