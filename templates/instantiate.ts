import type { Field } from "@puckeditor/core";
import { puckConfig } from "@/lib/puck/config";
import { escapeHtml, sanitizePuckData } from "@/lib/richtext";
import type { SiteCreationInput } from "@/lib/site-creation";
import type { WebsiteTemplate } from "./shared";

type Values = Pick<SiteCreationInput, "businessName" | "phone" | "city" | "services" | "email" | "address">;
type Fields = Record<string, Field>;

/** Replace plain text literally and escape values inserted into rich-text HTML. */
export function instantiateTemplate(template: WebsiteTemplate, values: Values): WebsiteTemplate["pages"] {
  const replace = (text: string, rich: boolean) => text.replace(
    /\{\{(businessName|phone|city|services|email|address)\}\}/g,
    (_, key: keyof Values) => rich ? escapeHtml(values[key]) : values[key],
  );
  const walk = (value: unknown, field?: Field): unknown => {
    if (typeof value === "string") return replace(value, field?.type === "richtext");
    if (Array.isArray(value)) {
      if (field?.type === "slot") return value.map(item);
      return value.map((child) => field?.type === "array"
        ? walkObject(child, field.arrayFields as Fields) : walk(child));
    }
    return walkObject(value, field?.type === "object" ? field.objectFields as Fields : undefined);
  };
  const walkObject = (value: unknown, fields?: Fields): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child, fields?.[key])]));
  };
  const item = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value;
    const block = value as { type?: string; props?: unknown };
    const component = puckConfig.components[block.type as keyof typeof puckConfig.components];
    return { ...block, props: walkObject(block.props, component?.fields as Fields | undefined) };
  };
  return template.pages.map((page) => {
    const data = structuredClone(page.data);
    data.content = data.content.map((block) => item(block) as typeof block);
    data.root.props = walkObject(data.root.props, puckConfig.root?.fields as Fields | undefined) as typeof data.root.props;
    return { ...page, data: sanitizePuckData(data) };
  });
}
