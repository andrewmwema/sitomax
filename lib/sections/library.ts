import { puckConfig } from "@/lib/puck/config";
import type { SectionDesign } from "./catalog";

type Item = { type: string; props: Record<string, unknown> };

/** Re-key nested slot items too, so inserting a saved layout never duplicates ids. */
export function buildDesignItem(design: SectionDesign): Item {
  const rekey = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rekey);
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    const result = Object.fromEntries(
      Object.entries(object).map(([key, child]) => [key, rekey(child)]),
    );
    if (typeof object.type === "string" && object.props && typeof object.props === "object") {
      result.props = {
        ...result.props as Record<string, unknown>,
        id: `${object.type}-${crypto.randomUUID()}`,
      };
    }
    return result;
  };
  const defaults = puckConfig.components[design.blockType as keyof typeof puckConfig.components]?.defaultProps;
  return rekey({
    type: design.blockType,
    props: { ...structuredClone(defaults), ...structuredClone(design.props) },
  }) as Item;
}
