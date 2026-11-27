import { brand } from "@/lib/brand";
import { resolveLink, type LinkContext } from "@/lib/links";
import type { SiteMenu } from "@/lib/page-navigation";

function isGraderLink(href: unknown, context: LinkContext) {
  const root = `${brand.rootDomain.includes("localhost") ? "http" : "https"}://${brand.rootDomain}`;
  const resolved = resolveLink(href, context);
  if (resolved.broken || resolved.href === "#") return false;
  try {
    const target = new URL(resolved.href, root);
    return target.origin === new URL(root).origin && target.pathname.replace(/\/+$/, "") === "/grader";
  } catch { return false; }
}

export function marketingGraderMenu(subdomain: string, menu: SiteMenu): SiteMenu {
  if (subdomain !== brand.marketingSiteSubdomain) return menu;
  const root = `${brand.rootDomain.includes("localhost") ? "http" : "https"}://${brand.rootDomain}`;
  const link = { label: "Free Website Grade", href: `${root}/grader` };
  return {
    ...menu,
    links: menu.links.some((item) => isGraderLink(item.href, { pages: {} })) ? menu.links : [...menu.links, link],
    extraLinks: [link],
  };
}

export function appendMarketingLinks<T extends { href: unknown }>(items: T[], extra: NonNullable<SiteMenu["extraLinks"]>, context: LinkContext): (T | typeof extra[number])[] {
  return [...items, ...extra.filter(() => !items.some((item) => isGraderLink(item.href, context)))];
}
