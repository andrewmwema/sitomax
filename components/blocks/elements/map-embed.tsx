import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import { oneOf } from "@/lib/layout/guardrails";
import type { BlockDesign } from "@/lib/sections/design";
import { ElementPlaceholder } from "./shared";

export type MapEmbedElementProps = {
  design?: BlockDesign;
  address: string;
  zoom: "12" | "14" | "16" | "18";
  height: "240" | "320" | "400" | "480";
};

export const MapEmbedElement: ComponentConfig<MapEmbedElementProps> = {
  label: "Map",
  inline: true,
  fields: {
    address: { type: "text", label: "Address or place" },
    zoom: {
      type: "radio",
      label: "Zoom",
      options: [
        { label: "City", value: "12" },
        { label: "Area", value: "14" },
        { label: "Street", value: "16" },
        { label: "Close", value: "18" },
      ],
    },
    height: {
      type: "select",
      label: "Height",
      options: [
        { label: "Small", value: "240" },
        { label: "Medium", value: "320" },
        { label: "Large", value: "400" },
        { label: "Extra large", value: "480" },
      ],
    },
    design: designField("element"),
  },
  defaultProps: { design: {}, address: "", zoom: "14", height: "320" },
  render: ({ address, zoom, height, puck }) => {
    const px = Number(oneOf(height, ["240", "320", "400", "480"], "320"));
    const query = (address ?? "").trim().slice(0, 200);
    if (!query) {
      return puck.isEditing ? (
        <ElementPlaceholder height={px}>Enter an address to show a map</ElementPlaceholder>
      ) : (
        <></>
      );
    }
    const src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${oneOf(zoom, ["12", "14", "16", "18"], "14")}&output=embed`;
    return (
      <iframe
        title={`Map of ${query}`}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block w-full border-0"
        style={{
          height: px,
          borderRadius: "var(--radius-sm)",
          pointerEvents: puck.isEditing ? "none" : undefined,
        }}
      />
    );
  },
};
