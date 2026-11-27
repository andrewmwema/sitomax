import { z } from "zod";
import type { Business } from "@/lib/business";

export const menuLabelSchema = z.string().trim().transform((label) => label.replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Enter a menu label.").max(40).regex(/^\S+( \S+){0,2}$/, "Use at most three words."));

export function defaultMenuLabel(slug: string) {
  const words = slug.split(/[-_/\s]+/).filter(Boolean).slice(0, 2);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ").slice(0, 40).trim() || "Home";
}

export function pageMenuLinks(pages: { slug: string; nav_label?: string | null }[], previewPrefix?: string) {
  return pages.map(({ slug, nav_label }) => ({
    label: menuLabelSchema.safeParse(nav_label).data ?? defaultMenuLabel(slug),
    href: `${previewPrefix ?? ""}/${slug.split("/").map(encodeURIComponent).join("/")}${previewPrefix ? "?preview=1" : ""}`,
  }));
}

export type SiteContacts = Pick<Business, "businessName" | "phone" | "email" | "address" | "openingHours" | "socialLinks">;
export type SiteMenu = { links: ReturnType<typeof pageMenuLinks>; contacts: SiteContacts; extraLinks?: ReturnType<typeof pageMenuLinks> };

export function businessContactDetails(business: SiteContacts) {
  const phone = business.phone.replace(/[^\d+]/g, "");
  return [
    { icon: "phone", label: "Phone", value: business.phone, href: phone ? `tel:${phone}` : "" },
    { icon: "mail", label: "Email", value: business.email, href: business.email ? `mailto:${business.email}` : "" },
    { icon: "map-pin", label: "Address", value: business.address, href: "" },
    { icon: "clock", label: "Opening hours", value: business.openingHours, href: "" },
  ].filter(({ value }) => value);
}

export function siteContacts({ businessName, phone, email, address, openingHours, socialLinks }: Business): SiteContacts {
  return { businessName, phone, email, address, openingHours, ...(socialLinks ? { socialLinks } : {}) };
}
