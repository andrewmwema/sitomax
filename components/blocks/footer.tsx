import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Container } from "./ui/container";
import { BlockIcon } from "./ui/icon";
import { businessContactDetails, type SiteMenu } from "@/lib/page-navigation";
import { safeHref } from "@/lib/layout/guardrails";

export type FooterProps = {
  design?: BlockDesign;
  businessName: string;
  phone: string;
  address: string;
  tagline?: string;
  email?: string;
  hours?: string;
  navigation?: { label: string; href: string }[];
  socialLinks: {
    platform: "facebook" | "instagram" | "x" | "linkedin" | "youtube" | "tiktok";
    url: string;
  }[];
  variant: "columns" | "centered" | "compact";
};

const PLATFORM_LABELS: Record<FooterProps["socialLinks"][number]["platform"], string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
};

export const Footer: ComponentConfig<FooterProps> = {
  label: "Footer",
  fields: {
    design: designField(),
    businessName: { type: "text", label: "Business name", contentEditable: true },
    phone: { type: "text", label: "Phone" },
    address: { type: "text", label: "Address" },
    tagline: { type: "textarea", label: "Brand introduction" },
    email: { type: "text", label: "Email" },
    hours: { type: "text", label: "Opening hours" },
    navigation: {
      type: "array", label: "Navigation", getItemSummary: (item) => item.label,
      defaultItemProps: { label: "Contact", href: "#contact" },
      arrayFields: { label: { type: "text", label: "Label" }, href: { type: "text", label: "Link" } },
    },
    socialLinks: {
      type: "array",
      label: "Social links",
      getItemSummary: (item) => PLATFORM_LABELS[item.platform] ?? "Link",
      defaultItemProps: { platform: "facebook", url: "" },
      arrayFields: {
        platform: {
          type: "select",
          label: "Platform",
          options: Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ label, value })),
        },
        url: { type: "text", label: "URL" },
      },
    },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Columns", value: "columns" },
        { label: "Centered", value: "centered" },
        { label: "Light compact", value: "compact" },
      ],
    },
  },
  defaultProps: {
    design: {},
    businessName: "Your business",
    phone: "",
    address: "",
    socialLinks: [],
    variant: "columns",
    tagline: "",
    email: "",
    hours: "",
    navigation: [],
  },
  render: ({ businessName, phone, address, socialLinks, variant, tagline, email, hours, navigation, puck }) => {
    const menu = puck.metadata?.siteMenu as SiteMenu | undefined;
    const name = menu?.contacts.businessName || businessName;
    const links = menu?.links ?? navigation;
    const details = businessContactDetails(menu?.contacts ?? {
      businessName, phone, address, email: email ?? "", openingHours: hours ?? "",
    });
    const centered = (variant ?? "columns") === "centered";

    const contact = (
      <div
        className={`flex flex-col gap-2 text-sm ${centered ? "items-center" : ""}`}
        style={{ lineHeight: 1.6 }}
      >
        {details.map(({ label, value, icon, href }) => href
          ? <a key={label} href={safeHref(href)} className="inline-flex min-h-12 items-center gap-2 break-all hover:underline"><BlockIcon name={icon} size={15} />{value}</a>
          : <p key={label} className="inline-flex items-center gap-2 whitespace-pre-line"><BlockIcon name={icon} size={15} />{value}</p>)}
      </div>
    );

    const social =
      socialLinks.length > 0 ? (
        <div className={`flex flex-wrap gap-5 text-sm font-medium ${centered ? "justify-center" : ""}`}>
          {socialLinks.map((link, i) => (
            <a
              key={i}
              href={safeHref(link.url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 items-center transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {PLATFORM_LABELS[link.platform] ?? link.platform}
            </a>
          ))}
        </div>
      ) : null;

    const brand = (
      <div className={`flex flex-col gap-2 ${centered ? "items-center text-center" : ""}`}>
        <p
          className="text-xl"
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: "var(--heading-weight)" as React.CSSProperties["fontWeight"],
            letterSpacing: "-0.5px",
          }}
        >
          {name}
        </p>
        {tagline ? <p className="max-w-[32ch] text-sm" style={{ color: "var(--color-muted)" }}>{tagline}</p> : null}
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          © {new Date().getFullYear()} {name}. All rights reserved.
        </p>
      </div>
    );

    return (
      <Section
        background={variant === "compact" ? "soft" : "dark"}
        container={false}
      >
        <footer>
          <Container
            className={
              centered
                ? "flex flex-col items-center gap-6 text-center"
                : "flex flex-col gap-8 md:flex-row md:items-start md:justify-between"
            }
          >
            {brand}
            {links?.length ? <nav aria-label={`${name} footer`} className={`flex flex-wrap gap-x-6 ${centered ? "justify-center" : variant === "columns" ? "flex-col" : ""}`}>
              {links.map((link, i) => <a key={i} href={safeHref(link.href)} className="inline-flex min-h-12 items-center text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">{link.label}</a>)}
            </nav> : null}
            {contact}
            {social}
          </Container>
        </footer>
      </Section>
    );
  },
};
