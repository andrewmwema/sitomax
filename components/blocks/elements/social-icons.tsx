import type { ComponentConfig } from "@puckeditor/core";
import {
  siFacebook,
  siInstagram,
  siPinterest,
  siTiktok,
  siWhatsapp,
  siX,
  siYoutube,
} from "simple-icons";
import { designField } from "@/lib/puck/fields";
import { alignField, colorField } from "@/lib/puck/layout-fields";
import {
  JUSTIFY,
  colorCss,
  oneOf,
  safeAlign,
  safeHref,
  type Align,
  type ColorChoice,
} from "@/lib/layout/guardrails";
import type { BlockDesign } from "@/lib/sections/design";

const PLATFORMS = {
  facebook: { label: "Facebook", path: siFacebook.path },
  instagram: { label: "Instagram", path: siInstagram.path },
  x: { label: "X (Twitter)", path: siX.path },
  // simple-icons doesn't ship LinkedIn; a simple drawn "in" mark.
  linkedin: {
    label: "LinkedIn",
    path: "M3 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0ZM3.2 8.5h3.6V21H3.2ZM9.3 8.5h3.4v1.7c.6-1.1 2-2 3.9-2 3.6 0 4.3 2.4 4.3 5.4V21h-3.6v-6.6c0-1.6-.1-3.4-2.2-3.4-2.1 0-2.4 1.6-2.4 3.3V21H9.3Z",
  },
  youtube: { label: "YouTube", path: siYoutube.path },
  tiktok: { label: "TikTok", path: siTiktok.path },
  pinterest: { label: "Pinterest", path: siPinterest.path },
  whatsapp: { label: "WhatsApp", path: siWhatsapp.path },
} as const;

type Platform = keyof typeof PLATFORMS;
const PLATFORM_IDS = Object.keys(PLATFORMS) as Platform[];

export type SocialIconsElementProps = {
  design?: BlockDesign;
  links: { platform: Platform; url: string }[];
  style: "plain" | "circle" | "square";
  size: "sm" | "md" | "lg";
  color: ColorChoice;
  align: Align;
};

const SIZES = { sm: 16, md: 20, lg: 26 } as const;

export const SocialIconsElement: ComponentConfig<SocialIconsElementProps> = {
  label: "Social icons",
  inline: true,
  fields: {
    links: {
      type: "array",
      label: "Profiles",
      getItemSummary: (item) => PLATFORMS[item.platform]?.label ?? "Profile",
      defaultItemProps: { platform: "facebook", url: "" },
      arrayFields: {
        platform: {
          type: "select",
          label: "Platform",
          options: PLATFORM_IDS.map((id) => ({ label: PLATFORMS[id].label, value: id })),
        },
        url: { type: "text", label: "Profile link" },
      },
    },
    style: {
      type: "radio",
      label: "Style",
      options: [
        { label: "Plain", value: "plain" },
        { label: "Circle", value: "circle" },
        { label: "Square", value: "square" },
      ],
    },
    size: {
      type: "radio",
      label: "Size",
      options: [
        { label: "S", value: "sm" },
        { label: "M", value: "md" },
        { label: "L", value: "lg" },
      ],
    },
    color: colorField("Color", { allowAuto: false }),
    align: alignField(),
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    links: [
      { platform: "facebook", url: "https://facebook.com" },
      { platform: "instagram", url: "https://instagram.com" },
      { platform: "linkedin", url: "https://linkedin.com" },
    ],
    style: "circle",
    size: "md",
    color: "primary",
    align: "left",
  },
  render: ({ links, style, size, color, align, puck }) => {
    const px = SIZES[oneOf(size, ["sm", "md", "lg"], "md")];
    const variant = oneOf(style, ["plain", "circle", "square"], "circle");
    const tint = colorCss(color, "primary") ?? "var(--color-primary)";
    const box =
      variant === "plain"
        ? { color: tint }
        : {
            width: px * 2.2,
            height: px * 2.2,
            borderRadius: variant === "circle" ? "9999px" : "var(--radius-sm)",
            backgroundColor: tint,
            color: "var(--color-on-primary)",
          };
    return (
      <ul
        className="m-0 flex list-none flex-wrap gap-3 p-0"
        style={{ justifyContent: JUSTIFY[safeAlign(align)] }}
      >
        {(links ?? []).map((link, i) => {
          const platform = PLATFORMS[oneOf(link.platform, PLATFORM_IDS, "facebook")];
          return (
            <li key={i}>
              <a
                href={safeHref(link.url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={platform.label}
                onClick={puck.isEditing ? (e) => e.preventDefault() : undefined}
                className="inline-flex items-center justify-center transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={box}
              >
                <svg viewBox="0 0 24 24" width={px} height={px} fill="currentColor" aria-hidden="true">
                  <path d={platform.path} />
                </svg>
              </a>
            </li>
          );
        })}
      </ul>
    );
  },
};
