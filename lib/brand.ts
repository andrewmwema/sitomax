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

/** SitoMax logo files in public/brand, trimmed from the agency logo uploads. Sizes are in pixels. */
export const brandLogo = {
  alt: "SitoMax",
  full: { path: "/brand/sitomax-logo.png", width: 1200, height: 319 },
  email: { path: "/brand/sitomax-logo-email.png", width: 480, height: 128 },
  mark: { path: "/brand/sitomax-mark.png", width: 286, height: 384 },
} as const;
