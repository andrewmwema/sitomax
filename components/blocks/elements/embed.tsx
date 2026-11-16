import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import { oneOf } from "@/lib/layout/guardrails";
import { EMBED_MAX_LENGTH, embedDocument, safeEmbedCode } from "@/lib/layout/embed";
import type { BlockDesign } from "@/lib/sections/design";
import { ElementPlaceholder } from "./shared";

export type EmbedElementProps = {
  design?: BlockDesign;
  title: string;
  code: string;
  height: "200" | "320" | "480" | "640" | "800";
};

/**
 * Agency-only custom HTML/JS (booking widgets, review badges…). The code
 * runs in an opaque-origin sandbox — `allow-scripts` WITHOUT
 * `allow-same-origin` — so it can't read the site's cookies, storage or
 * DOM. Who may add/change it is enforced in lib/layout/embed.ts, the
 * updatePage action and a database trigger, not just this UI.
 */
export const EmbedElement: ComponentConfig<EmbedElementProps> = {
  label: "Embed (agency only)",
  inline: true,
  fields: {
    title: { type: "text", label: "Title (for screen readers)" },
    code: {
      type: "textarea",
      label: `HTML / script (max ${EMBED_MAX_LENGTH.toLocaleString("en-US")} characters)`,
    },
    height: {
      type: "select",
      label: "Height",
      options: [
        { label: "200px", value: "200" },
        { label: "320px", value: "320" },
        { label: "480px", value: "480" },
        { label: "640px", value: "640" },
        { label: "800px", value: "800" },
      ],
    },
    design: designField("element"),
  },
  defaultProps: { design: {}, title: "Embedded content", code: "", height: "320" },
  render: ({ title, code, height, puck }) => {
    const px = Number(oneOf(height, ["200", "320", "480", "640", "800"], "320"));
    const safe = safeEmbedCode(code);
    if (!safe) {
      return puck.isEditing ? (
        <ElementPlaceholder height={px}>Paste embed code in the sidebar</ElementPlaceholder>
      ) : (
        <></>
      );
    }
    return (
      <iframe
        title={title || "Embedded content"}
        sandbox="allow-scripts"
        srcDoc={embedDocument(safe)}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="block w-full border-0"
        style={{ height: px, pointerEvents: puck.isEditing ? "none" : undefined }}
      />
    );
  },
};
