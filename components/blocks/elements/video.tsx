import type { ComponentConfig } from "@puckeditor/core";
import { designField, imageField } from "@/lib/puck/fields";
import { oneOf } from "@/lib/layout/guardrails";
import {
  safeMediaUrl,
  safeUploadedVideoUrl,
  videoPlayerUrl,
  type BlockDesign,
} from "@/lib/sections/design";
import { VideoUploadField } from "@/components/editor/video-upload-field";
import { ElementPlaceholder } from "./shared";

export type VideoElementProps = {
  design?: BlockDesign;
  source: "link" | "upload";
  url: string;
  file: string;
  poster: string;
  aspect: "16/9" | "4/3" | "1/1" | "9/16";
  autoplay: boolean;
};

export const VideoElement: ComponentConfig<VideoElementProps> = {
  label: "Video",
  inline: true,
  fields: {
    source: {
      type: "radio",
      label: "Source",
      options: [
        { label: "YouTube / Vimeo", value: "link" },
        { label: "Upload", value: "upload" },
      ],
    },
    url: { type: "text", label: "Video link", placeholder: "https://youtube.com/watch?v=…" },
    file: {
      type: "custom",
      label: "Video file",
      render: ({ value, onChange, readOnly }) => (
        <VideoUploadField value={value ?? ""} onChange={onChange} readOnly={readOnly} />
      ),
    },
    poster: imageField("Cover image (optional)", ["16/9", "4/3", "1/1", "9/16"]),
    aspect: {
      type: "select",
      label: "Shape",
      options: [
        { label: "Wide 16:9", value: "16/9" },
        { label: "Classic 4:3", value: "4/3" },
        { label: "Square", value: "1/1" },
        { label: "Vertical 9:16", value: "9/16" },
      ],
    },
    autoplay: {
      type: "radio",
      label: "Autoplay (muted)",
      options: [
        { label: "Off", value: false },
        { label: "On", value: true },
      ],
    },
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    source: "link",
    url: "",
    file: "",
    poster: "",
    aspect: "16/9",
    autoplay: false,
  },
  resolveFields: (data, { fields }) => {
    const { url, file, poster, ...rest } = fields;
    return (
      data.props.source === "upload" ? { ...rest, file, poster } : { ...rest, url }
    ) as typeof fields;
  },
  render: ({ source, url, file, poster, aspect, autoplay, puck }) => {
    const ratio = oneOf(aspect, ["16/9", "4/3", "1/1", "9/16"], "16/9");
    const frame = {
      aspectRatio: ratio,
      borderRadius: "var(--radius-sm)",
      pointerEvents: puck.isEditing ? ("none" as const) : undefined,
    };
    const auto = autoplay === true;
    if (source === "upload") {
      const src = safeUploadedVideoUrl(file);
      if (src) {
        return (
          <video
            src={src}
            poster={safeMediaUrl(poster) ?? undefined}
            controls
            playsInline
            preload="metadata"
            autoPlay={auto && !puck.isEditing}
            muted={auto}
            loop={auto}
            className="block w-full bg-black object-cover"
            style={frame}
          />
        );
      }
    } else {
      const src = videoPlayerUrl(url, { autoplay: auto && !puck.isEditing });
      if (src) {
        return (
          <iframe
            title="Video"
            src={src}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="block w-full border-0 bg-black"
            style={frame}
          />
        );
      }
    }
    return puck.isEditing ? (
      <ElementPlaceholder>
        {source === "upload" ? "Upload an MP4 or WebM video" : "Paste a YouTube or Vimeo link"}
      </ElementPlaceholder>
    ) : (
      <></>
    );
  },
};
