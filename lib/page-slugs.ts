import { z } from "zod";

/** Page slug rules shared by the server page actions and the editor's Pages panel. */

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// First path segments the platform handles itself on site hosts (see proxy.ts).
export const RESERVED_PAGE_SLUGS = new Set([
  "dashboard", "login", "signup", "auth", "invite", "editor", "forgot-password", "set-password",
  "api", "s", "robots-txt", "sitemap-xml", "favicon-ico",
]);

export const pageTitleSchema = z.string().trim().min(1, "Enter a page name.").max(80, "Use 80 characters or fewer.");

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** Returns an error message, or null when the slug can be used. */
export function slugError(slug: string, taken: Iterable<string> = []): string | null {
  if (!slug) return "Enter a slug.";
  if (slug.length > 60) return "Use 60 characters or fewer.";
  if (!SLUG_REGEX.test(slug)) return "Use lowercase letters, numbers and single dashes.";
  if (RESERVED_PAGE_SLUGS.has(slug)) return `“${slug}” is reserved. Choose another slug.`;
  if (new Set(taken).has(slug)) return "Another page already uses this slug.";
  return null;
}

export function uniqueSlug(value: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(value) || "page";
  const safe = RESERVED_PAGE_SLUGS.has(base) ? `${base}-page` : base;
  let slug = safe;
  for (let i = 2; used.has(slug); i++) slug = `${safe.slice(0, 55)}-${i}`;
  return slug;
}
