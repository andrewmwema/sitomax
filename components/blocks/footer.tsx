import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Container } from "./ui/container";
import { BlockIcon } from "./ui/icon";

export type FooterProps = {
  design?: BlockDesign;
  businessName: string;
  phone: string;
  address: string;
  socialLinks: {
    platform: "facebook" | "instagram" | "x" | "linkedin" | "youtube" | "tiktok";
    url: string;
  }[];
  variant: "columns" | "centered";
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
  },
  render: ({ businessName, phone, address, socialLinks, variant }) => {
    const centered = (variant ?? "columns") === "centered";

    const contact = (
      <div
        className={`flex flex-col gap-2 text-sm ${centered ? "items-center" : ""}`}
        style={{ lineHeight: 1.6 }}
      >
        {phone ? (
          <a
            href={`tel:${phone.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-2 transition hover:opacity-80"
          >
            <BlockIcon name="phone" size={15} />
            {phone}
          </a>
        ) : null}
        {address ? (
          <p className="inline-flex items-center gap-2" style={{ color: "var(--color-muted)" }}>
            <BlockIcon name="map-pin" size={15} />
            {address}
          </p>
        ) : null}
      </div>
    );

    const social =
      socialLinks.length > 0 ? (
        <div className={`flex flex-wrap gap-5 text-sm font-medium ${centered ? "justify-center" : ""}`}>
          {socialLinks.map((link, i) => (
            <a
              key={i}
              href={link.url || "#"}
              target="_blank"
              rel="noreferrer"
              className="transition hover:opacity-80"
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
          {businessName}
        </p>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          © {new Date().getFullYear()} {businessName}. All rights reserved.
        </p>
      </div>
    );

    return (
      <Section
        background="dark"
        container={false}
        style={{ paddingTop: 56, paddingBottom: 56 }}
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
            {contact}
            {social}
          </Container>
        </footer>
      </Section>
    );
  },
};
