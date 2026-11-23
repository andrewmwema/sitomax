import type { Data } from "@puckeditor/core";
import { z } from "zod";
import { extractNavigation, headerSchema, type HeaderRoot, type SiteHeaderData } from "@/lib/header";

/**
 * Where the editor reads a page's draft from. Drafts have no tables of their
 * own: page content, including that page's copy of the shared footer, is
 * `pages.draft_data`; the theme is `sites.draft_theme` (falling back to the
 * live `sites.theme` until a draft exists) and the header is
 * `sites.draft_header`. `pages.draft_version` changes with every draft write.
 * Everything that writes drafts, the AI agent's apply and undo included, must
 * write these columns.
 */
export const EDITOR_DRAFT_SOURCE = {
  page: "seo, draft_data, draft_version",
  site: "theme, draft_theme, draft_header",
} as const;

/** The draft the editor opens for a page, from the columns in EDITOR_DRAFT_SOURCE. */
export function editorDraft<Theme>(
  page: { seo: unknown; draft_data: unknown; draft_version: string },
  site: { theme: Theme | null; draft_theme: Theme | null; draft_header?: unknown },
) {
  return {
    data: editorInitialData(page.draft_data, page.seo),
    version: page.draft_version,
    theme: site.draft_theme ?? site.theme ?? null,
    draftHeader: site.draft_header ?? null,
  };
}

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
