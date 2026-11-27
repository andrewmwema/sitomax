import type { CSSProperties } from "react";
import {
  headerColors, headerDesign, headerLink, resolveHeaderLink, type HeaderDesign, type SiteHeaderData,
} from "@/lib/header";
import { fontFamily, googleFontsUrl } from "@/lib/theme/fonts";
import { linkAttributes, type LinkContext } from "@/lib/links";
import { businessContactDetails, type SiteMenu } from "@/lib/page-navigation";
import { Button } from "@/components/blocks/ui/button";
import { HeaderBehavior } from "./header-behavior";
import { Menu, Ellipsis, ChevronDown, X, Phone, ArrowUpRight } from "lucide-react";
import { appendMarketingLinks } from "@/lib/grader/marketing-menu";
import "./site-header.css";

type Props = {
  header: SiteHeaderData; menu: SiteMenu; links: LinkContext; path?: string;
  transparent?: boolean; editing?: boolean;
};
type MenuItem = { label: string; href: unknown; children?: { label: string; href: unknown }[] };
function MenuLinks({ items, context, path }: { items: MenuItem[]; context: LinkContext; path?: string }) {
  return items.map((item, index) => <li key={`${index}-${item.label}`}>
    {item.children?.length ? <details className="sh-dropdown">
      <summary>{item.label}<ChevronDown size={14} aria-hidden="true" /></summary>
      <ul>
        <li><a {...headerLink(item.href, context, path)}>{item.label}</a></li>
        {item.children.map((child, childIndex) => <li key={childIndex}><a {...headerLink(child.href, context, path)}>{child.label}</a></li>)}
      </ul>
    </details> : <a {...headerLink(item.href, context, path)}>{item.label}</a>}
  </li>);
}
function variables(design: HeaderDesign, transparent: boolean): CSSProperties {
  const colors = headerColors(design);
  const photoOrTransparent = transparent || design.layout === "overlay" || ["image", "transparent"].includes(design.background);
  const background = transparent || design.layout === "overlay" || design.background === "transparent" ? "transparent"
    : design.background === "gradient" ? `linear-gradient(120deg, ${design.color}, ${design.gradientTo})`
      : design.background === "image" && design.image ? `url(${JSON.stringify(design.image)}) center / cover` : design.color;
  return {
    "--sh-height": `${design.height}px`, "--sh-pad": `${design.padding}px`, "--sh-pad-y": `${design.paddingY}px`, "--sh-logo-height": `${design.logoHeight}px`,
    "--sh-bg": background, "--sh-fg": colors.foreground, "--sh-hover-color": colors.hover,
    "--sh-scroll-bg": design.scrollColor, "--sh-scroll-fg": colors.scrolled,
    "--sh-panel-bg": design.panelColor, "--sh-panel-fg": colors.panel,
    "--sh-scroll-hover": colors.scrollHover,
    "--sh-initial-backing": colors.backing ?? (photoOrTransparent ? design.color : "transparent"),
    "--sh-border": design.border ? `1px solid ${design.borderColor}` : "0",
    "--sh-shadow": design.shadow ? "0 6px 24px #00000012" : "none",
    "--sh-blur": design.blur ? "blur(16px)" : "none",
    fontFamily: fontFamily(design.font), fontSize: design.fontSize,
    fontWeight: design.weight, letterSpacing: `${design.letterSpacing}px`,
    textTransform: design.uppercase ? "uppercase" : "none",
  } as CSSProperties;
}
export function SiteHeader({ header, menu, links, path, transparent = false, editing = false }: Props) {
  const id = "site-header";
  const items: MenuItem[] = header.menu.source === "pages" ? menu.links
    : appendMarketingLinks(header.menu.items, menu.extraLinks ?? [], links);
  const contacts = businessContactDetails(menu.contacts);
  const brand = header.logo.text || menu.contacts.businessName;
  const brandLink = <a className="sh-brand" {...headerLink(header.logo.href, links)} aria-label={brand || "Home"}>
    {header.logo.mode === "image" && header.logo.image ?
      // eslint-disable-next-line @next/next/no-img-element
      <img src={header.logo.image} alt={brand} width={180} height={48} />
      : <span>{brand}</span>}
  </a>;
  const legacyContact = typeof header.cta.href === "string" && /^tel:/i.test(header.cta.href)
    ? (menu.contacts.phone ? `tel:${menu.contacts.phone}` : "") : typeof header.cta.href === "string" && /^mailto:/i.test(header.cta.href)
      ? (menu.contacts.email ? `mailto:${menu.contacts.email}` : "") : header.cta.href;
  const ctaLink = resolveHeaderLink(legacyContact, links);
  const actionPath = ctaLink.href.split(/[?#]/)[0];
  const knownPage = !actionPath.startsWith("/") || Object.values(links.pages).some(target => target.split(/[?#]/)[0] === actionPath);
  const showCta = header.cta.text && legacyContact && !ctaLink.broken && ctaLink.href !== "#" && knownPage;
  const buttonVariant = header.cta.style === "outline" ? "secondary" : header.cta.style;
  const cta = showCta ? <Button href={{ __resolved: true, ...ctaLink }} variant={buttonVariant}
    className="sh-cta">{header.cta.text}</Button> : null;
  const compactCta = showCta ? <Button href={{ __resolved: true, ...ctaLink }} variant={buttonVariant} className="sh-cta sh-icon-cta">
    <ArrowUpRight size={20} aria-hidden="true" /><span className="sr-only">{header.cta.text}</span>
  </Button> : null;
  return <HeaderBehavior editing={editing}>
    <link rel="stylesheet" href={googleFontsUrl(["desktop", "tablet", "mobile"].map(device =>
      headerDesign(header, device as "desktop" | "tablet" | "mobile").font))} />
    <a className="sh-skip" href="#site-main-content">Skip to content</a>
    {(["desktop", "tablet", "mobile"] as const).map(device => {
      const design = headerDesign(header, device);
      const compact = ["left-toggle", "right-toggle", "center-logo", "minimal"].includes(design.layout);
      const dialogId = `${id}-${device}-menu`;
      const split = Math.ceil(items.length / 2);
      const contactInfo = <div className="sh-contacts">{contacts.filter(contact => contact.icon !== "clock").map(contact => contact.href
        ? <a key={contact.label} {...linkAttributes(contact.href)}>{contact.value}</a>
        : <span key={contact.label}>{contact.value}</span>)}
        {menu.contacts.socialLinks?.map((social, index) => <a key={`social-${index}`} {...linkAttributes(social.url)}>{social.label}</a>)}
      </div>;
      return <header key={device} data-header-device={device} data-layout={design.layout}
        data-sticky={design.sticky || design.layout === "overlay"} data-shrink={design.shrink}
        data-overlay={transparent || design.layout === "overlay"} data-width={design.container}
        data-scroll-background={transparent || design.layout === "overlay" || design.background === "transparent"}
        data-icon-position={design.iconPosition} data-indicator={design.indicator} style={variables(design, transparent)}>
        {design.layout === "topbar" ? <div className="sh-topbar">{contactInfo}</div> : null}
        <div className="sh-inner">
          {design.layout === "split" ? <nav className="sh-nav sh-split-start" aria-label="Primary, first links">
            <ul><MenuLinks items={items.slice(0, split)} context={links} path={path} /></ul>
          </nav> : null}
          {brandLink}
          {design.layout === "contact" ? contactInfo : null}
          {!compact ? <nav className="sh-nav" aria-label={design.layout === "split" ? "Primary, remaining links" : "Primary"}>
            <ul><MenuLinks items={design.layout === "split" ? items.slice(split) : items} context={links} path={path} />
              {design.layout === "split" && cta ? <li>{cta}</li> : null}
            </ul>
          </nav> : null}
          {!compact && design.layout !== "split" ? <div className="sh-action">{cta}</div> : null}
          {compact ? <>
            <button type="button" className="sh-toggle" data-header-toggle="" aria-label="Open navigation menu"
              aria-controls={dialogId} aria-expanded="false">
              <span aria-hidden="true">{design.iconStyle === "text" ? "Menu" : design.iconStyle === "dots" ? <Ellipsis /> : <Menu />}</span>
            </button>
            <div className="sh-compact-action">
              {design.action === "cta" ? compactCta : design.action === "phone" && menu.contacts.phone ?
                <a {...linkAttributes(`tel:${menu.contacts.phone}`)} aria-label={`Call ${menu.contacts.phone}`}><Phone size={20} aria-hidden="true" /></a> : null}
            </div>
            <dialog id={dialogId} className="sh-panel" data-panel={design.panel} aria-label="Navigation menu">
              <button type="button" data-header-close="" className="sh-close" aria-label="Close navigation menu">Close <X size={16} aria-hidden="true" /></button>
              <nav aria-label="Primary"><ul><MenuLinks items={items} context={links} path={path} /></ul></nav>
              {cta}
              {header.contactsInMenu ? contactInfo : null}
            </dialog>
          </> : null}
        </div>
      </header>;
    })}
  </HeaderBehavior>;
}
