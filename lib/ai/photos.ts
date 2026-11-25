import "server-only";

import type { Field } from "@puckeditor/core";
import { aiImageSuggestionSchema, imageFieldPath } from "@/lib/editor/ai-image-suggestions";
import { blockFields, isImageField } from "./site-schemas";

export function prepareSectionPhotoSuggestions(type: string, props: Record<string, unknown>, warnings: Set<string>) {
  function walk(record: Record<string, unknown>, fields: Record<string, Field>, owner: Record<string, unknown>,
    path: (string | number)[], sectionType: string) {
    for (const [key, field] of Object.entries(fields)) {
      const value = record[key];
      const nextPath = [...path, key];
      if (isImageField(field)) {
        const query = typeof value === "string" ? value.trim() : "";
        record[key] = "";
        if (!query || sectionType === "Team" || sectionType === "Logos") continue;
        if (/^(?:https?:|data:|\/)/i.test(query)) {
          warnings.add("An invalid photo search was omitted. Choose an image in the editor.");
          continue;
        }
        const altKey = key === "url" || key === "src" ? "alt" : key === "image" ? "imageAlt" : `${key}Alt`;
        const alt = typeof record[altKey] === "string" && record[altKey].trim() ? record[altKey] : query;
        const suggestion = aiImageSuggestionSchema.parse({ query: query.slice(0, 100), alt: alt.slice(0, 500) });
        const previous = owner.__aiImageSuggestions;
        if (previous !== undefined && (!previous || typeof previous !== "object" || Array.isArray(previous))) {
          throw new Error("Generated image suggestions are invalid.");
        }
        owner.__aiImageSuggestions = { ...previous, [imageFieldPath(nextPath)]: suggestion };
        warnings.add("Choose suggested photos in the editor; image placeholders are used until then.");
      } else if (field.type === "array" && Array.isArray(value)) {
        value.forEach((child, index) => {
          if (child && typeof child === "object" && !Array.isArray(child)) {
            walk(child, field.arrayFields as Record<string, Field>, owner, [...nextPath, index], sectionType);
          }
        });
      } else if (field.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, field.objectFields as Record<string, Field>, owner, nextPath, sectionType);
      } else if (field.type === "slot" && Array.isArray(value)) {
        for (const child of value) {
          if (!child || typeof child !== "object" || Array.isArray(child)) continue;
          const item = child as { type?: unknown; props?: unknown };
          if (typeof item.type === "string" && item.props && typeof item.props === "object" && !Array.isArray(item.props)) {
            const childProps = item.props as Record<string, unknown>;
            walk(childProps, blockFields(item.type), childProps, [], item.type);
          }
        }
      }
    }
  }
  if (type !== "Navigation" && type !== "Footer") walk(props, blockFields(type), props, [], type);
}
