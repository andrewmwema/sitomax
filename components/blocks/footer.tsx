import type { ComponentConfig } from "@puckeditor/core";

export type FooterProps = {
  businessName: string;
  phone: string;
  address: string;
  socialLinks: { platform: "facebook" | "instagram" | "x" | "linkedin" | "youtube" | "tiktok"; url: string }[];
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
    businessName: { type: "text", label: "Business name" },
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
  },
  defaultProps: {
    businessName: "Your business",
    phone: "",
    address: "",
    socialLinks: [],
  },
  render: ({ businessName, phone, address, socialLinks }) => (
    <footer
      className="w-full"
      style={{
        background: "color-mix(in srgb, var(--color-text) 94%, var(--color-background))",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <p
            className="text-lg font-semibold"
            style={{ color: "var(--color-background)", fontFamily: "var(--font-heading)" }}
          >
            {businessName}
          </p>
          <p className="text-sm opacity-70" style={{ color: "var(--color-background)" }}>
            © {new Date().getFullYear()} {businessName}. All rights reserved.
          </p>
        </div>
        <div
          className="flex flex-col gap-1.5 text-sm opacity-85"
          style={{ color: "var(--color-background)" }}
        >
          {phone ? <a href={`tel:${phone.replace(/\s+/g, "")}`}>{phone}</a> : null}
          {address ? <p>{address}</p> : null}
        </div>
        {socialLinks.length > 0 ? (
          <div className="flex flex-wrap gap-4 text-sm font-medium">
            {socialLinks.map((link, i) => (
              <a
                key={i}
                href={link.url || "#"}
                target="_blank"
                rel="noreferrer"
                className="transition hover:opacity-80"
                style={{ color: "var(--color-background)" }}
              >
                {PLATFORM_LABELS[link.platform] ?? link.platform}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </footer>
  ),
};
