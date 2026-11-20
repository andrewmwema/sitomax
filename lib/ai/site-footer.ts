import { z } from "zod";
import { puckConfig } from "@/lib/puck/config";
import type { LayoutItem } from "@/lib/layout/structure";

const draftSchema = z.object({
  content: z.array(z.object({ type: z.string(), props: z.record(z.string(), z.unknown()) })),
});

export function sharedSiteFooter(pages: { slug: string; draft_data?: unknown; published_data?: unknown }[],
  fallback?: { type: string; props: Record<string, unknown> }): LayoutItem {
  for (const page of [...pages].sort((a, b) => Number(b.slug === "") - Number(a.slug === ""))) {
    for (const data of [page.draft_data, page.published_data]) {
      const parsed = draftSchema.safeParse(data);
      const footer = parsed.success && parsed.data.content.find(({ type }) => type === "Footer");
      if (footer) return freshFooter(footer);
    }
  }
  return freshFooter({ type: "Footer", props: {
    ...(fallback ? { variant: fallback.props.variant, design: fallback.props.design } : {}),
  } });
}

export function freshFooter(footer: { type: string; props: Record<string, unknown> }): LayoutItem {
  return { type: "Footer", props: {
    ...puckConfig.components.Footer.defaultProps, ...structuredClone(footer.props), id: `Footer-${crypto.randomUUID()}`,
  } };
}
