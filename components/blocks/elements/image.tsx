import type { ComponentConfig } from "@puckeditor/core";
import { designField, imageField, linkField } from "@/lib/puck/fields";
import { linkAttributes, type LinkValue } from "@/lib/links";
import { JUSTIFY, oneOf, safeAlign, type Align } from "@/lib/layout/guardrails";
import { safeMediaUrl, type BlockDesign } from "@/lib/sections/design";
import { ElementPlaceholder, RADIUS, WIDTH_OPTIONS, type RadiusChoice } from "./shared";
import { SiteImage } from "../ui/site-image";

type Aspect = "auto" | "1/1" | "4/3" | "3/2" | "16/9" | "3/4";

export type ImageElementProps = {
  design?: BlockDesign;
  src: string;
  alt: string;
  link?: LinkValue;
  aspect: Aspect;
  fit: "cover" | "contain";
  radius: RadiusChoice;
  width: string;
  align: Align;
};

export const ImageElement: ComponentConfig<ImageElementProps> = {
  label: "Image",
  inline: true,
  fields: {
    src: imageField("Image", ["auto", "1/1", "4/3", "3/2", "16/9", "3/4"]),
    alt: { type: "text", label: "Alt text (describe the image)" },
    link: linkField("Link (optional)"),
    aspect: {
      type: "select",
      label: "Shape",
      options: [
        { label: "Original", value: "auto" },
        { label: "Square", value: "1/1" },
        { label: "Landscape 4:3", value: "4/3" },
        { label: "Landscape 3:2", value: "3/2" },
        { label: "Wide 16:9", value: "16/9" },
        { label: "Portrait 3:4", value: "3/4" },
      ],
    },
    fit: {
      type: "radio",
      label: "Fit",
      options: [
        { label: "Fill", value: "cover" },
        { label: "Fit", value: "contain" },
      ],
    },
    radius: {
      type: "select",
      label: "Corners",
      options: [
        { label: "Square", value: "none" },
        { label: "Theme", value: "theme" },
        { label: "Rounded", value: "large" },
        { label: "Circle", value: "round" },
      ],
    },
    width: { type: "select", label: "Width", options: WIDTH_OPTIONS },
    align: {
      type: "radio",
      label: "Alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
      ],
    },
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    src: "",
    alt: "",
    link: "",
    aspect: "4/3",
    fit: "cover",
    radius: "theme",
    width: "100",
    align: "center",
  },
  render: ({ src, alt, link, aspect, fit, radius, width, align, puck }) => {
    const url = safeMediaUrl(src);
    const ratio = oneOf(aspect, ["auto", "1/1", "4/3", "3/2", "16/9", "3/4"], "4/3");
    const widthPct = oneOf(width, ["100", "75", "50", "25"], "100");
    const image = url ? (
      <SiteImage
        src={url}
        alt={alt || ""}
        className="block h-auto w-full"
        style={{
          aspectRatio: ratio === "auto" ? undefined : ratio,
          objectFit: oneOf(fit, ["cover", "contain"], "cover"),
          borderRadius: RADIUS[oneOf(radius, ["none", "theme", "large", "round"], "theme")],
        }}
      />
    ) : puck.isEditing ? (
      <ElementPlaceholder>Choose an image</ElementPlaceholder>
    ) : null;
    if (!image) return <></>;
    return (
      <div className="flex" style={{ justifyContent: JUSTIFY[safeAlign(align, "center")] }}>
        <div style={{ width: `${widthPct}%` }}>
          {link && url ? (
            <a {...linkAttributes(link)} onClick={puck.isEditing ? (e) => e.preventDefault() : undefined}>
              {image}
            </a>
          ) : (
            image
          )}
        </div>
      </div>
    );
  },
};
