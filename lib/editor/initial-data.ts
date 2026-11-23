import type { Data } from "@puckeditor/core";
import { z } from "zod";
import { extractNavigation, headerSchema, type HeaderRoot, type SiteHeaderData } from "@/lib/header";

/** A stored draft with saved SEO choices filled into the root fields the editor shows. */
export function editorInitialData(draftData: unknown, seo: unknown) {
  const savedSeo = z.object({
    image: z.string().optional(), noindex: z.boolean().nullable().optional(),
  }).safeParse(seo).data;
  const draft = z.object({ root: z.object({ props: z.record(z.string(), z.unknown()).optional() }).passthrough().optional() })
    .passthrough().parse(draftData);
  const draftProps = draft.root?.props ?? {};
  return { ...draft, root: { ...draft.root, props: {
    ...(savedSeo?.image !== undefined && draftProps.socialImage === undefined ? { socialImage: savedSeo.image } : {}),
    ...(savedSeo?.noindex !== undefined && draftProps.indexing === undefined
      ? { indexing: savedSeo.noindex === null ? "inherit" : savedSeo.noindex ? "noindex" : "index" } : {}),
    ...draftProps,
  } } };
}

/** The Puck document for a draft: legacy navigation extracted and the site header attached. */
export function editorPuckData(initialData: unknown, options: {
  headersReady: boolean; pageTitle: string | null; draftHeader: unknown; fallbackHeader: () => SiteHeaderData;
}): Data {
  const raw = (initialData ?? {}) as Partial<Data>;
  const extracted = extractNavigation({ content: raw.content ?? [] });
  const rootProps: HeaderRoot = raw.root?.props ?? {};
  return {
    ...raw,
    content: options.headersReady && !rootProps.__legacyNavigation ? extracted.data.content : raw.content ?? [],
    root: {
      ...raw.root,
      props: { title: options.pageTitle ?? "", description: "", ...rootProps,
        ...(options.headersReady ? { __editorHeader: options.draftHeader ? headerSchema.parse(options.draftHeader) :
          extracted.header ?? options.fallbackHeader() } : {}),
      },
    },
  } as Data;
}
