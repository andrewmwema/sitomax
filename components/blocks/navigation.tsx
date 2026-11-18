import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { SiteNavigation } from "./ui/site-navigation";
import type { SiteMenu } from "@/lib/page-navigation";
import { safeHref } from "@/lib/layout/guardrails";

export type NavigationProps = {
  design?: BlockDesign;
  businessName: string;
  brandLink: string;
  links: { label: string; href: string }[];
  buttonText: string;
  buttonLink: string;
  variant: "light" | "dark";
};

export const Navigation: ComponentConfig<NavigationProps> = {
  label: "Navigation",
  fields: {
    design: designField(),
    businessName: { type: "text", label: "Business name" },
    brandLink: { type: "text", label: "Brand link" },
    links: {
      type: "array", label: "Menu links", getItemSummary: (link) => link.label || "Link",
      defaultItemProps: { label: "New page", href: "/" },
      arrayFields: { label: { type: "text", label: "Label" }, href: { type: "text", label: "Link" } },
    },
    buttonText: { type: "text", label: "Action text" },
    buttonLink: { type: "text", label: "Action link" },
    variant: { type: "radio", label: "Style", options: [{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }] },
  },
  defaultProps: {
    design: {}, businessName: "[Business name]", brandLink: "/",
    links: [{ label: "Home", href: "/" }, { label: "About", href: "/about" }, { label: "Services", href: "/services" }],
    buttonText: "Get in touch", buttonLink: "/contact", variant: "light",
  },
  render: ({ variant, businessName, brandLink, links, buttonText, buttonLink, puck }) => {
    const menu = puck.metadata?.siteMenu as SiteMenu | undefined;
    const menuHref = (href: string) => menu ? menu.links.find((link) => {
      const path = link.href.split("?")[0];
      return path === href || (link.href.endsWith("?preview=1") && path.replace(/^\/s\/[^/]+/, "") === href);
    })?.href : undefined;
    const actionHref = /^tel:/i.test(buttonLink) && menu ? (menu.contacts.phone ? `tel:${menu.contacts.phone.replace(/[^\d+]/g, "")}` : "")
      : /^mailto:/i.test(buttonLink) && menu ? (menu.contacts.email ? `mailto:${menu.contacts.email}` : "")
        : menu && buttonLink.startsWith("/") ? menuHref(buttonLink) : safeHref(buttonLink);
    return <Section background={variant === "dark" ? "dark" : "default"} style={{ paddingTop: "var(--section-pad-top, var(--content-gap))", paddingBottom: "var(--section-pad-bottom, var(--content-gap))" }}>
      <SiteNavigation businessName={menu?.contacts.businessName || businessName} brandLink={menuHref("/") ?? safeHref(brandLink)}
        links={menu?.links ?? links} buttonText={actionHref && actionHref !== "#" ? buttonText : ""} buttonLink={actionHref ?? ""} />
    </Section>;
  },
};
