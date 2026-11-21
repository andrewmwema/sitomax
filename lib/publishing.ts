export type PublishPage = {
  id: string;
  hasChanges: boolean;
  footerChanged: boolean;
};

export type SitePublishState = {
  pages: PublishPage[];
  headerChanged: boolean;
  themeChanged: boolean;
  blogSettingsChanged: boolean;
};

export type PublishSelection = {
  pageIds: string[];
  publishHeader: boolean;
  publishTheme: boolean;
  publishBlogSettings: boolean;
};

function contentBlocks(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || !("content" in value)) return [];
  const content = (value as { content?: unknown }).content;
  return Array.isArray(content)
    ? content.filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === "object")
    : [];
}

function comparablePageData(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("root" in value)) return value;
  const data = value as { root?: unknown };
  if (!data.root || typeof data.root !== "object" || !("props" in data.root)) return value;
  const root = data.root as { props?: unknown };
  if (!root.props || typeof root.props !== "object") return value;
  const props = { ...(root.props as Record<string, unknown>) };
  delete props.__editorHeader;
  delete props.__expectedHeader;
  delete props.__editorTheme;
  return { ...data, root: { ...root, props } };
}

export function hasUnpublishedPageChanges(draft: unknown, published: unknown): boolean {
  return published == null || JSON.stringify(comparablePageData(draft)) !== JSON.stringify(comparablePageData(published));
}

export function hasUnpublishedFooterChanges(draft: unknown, published: unknown): boolean {
  const draftFooters = contentBlocks(draft).filter((block) => block.type === "Footer");
  const publishedFooters = contentBlocks(published).filter((block) => block.type === "Footer");
  return JSON.stringify(draftFooters) !== JSON.stringify(publishedFooters);
}

export function publishChangeCount(state: SitePublishState): number {
  return state.pages.filter((page) => page.hasChanges).length +
    Number(state.headerChanged) + Number(state.themeChanged) + Number(state.blogSettingsChanged);
}

export function defaultPublishScope(state: SitePublishState, currentPageId: string): "page" | "site" {
  return state.pages.some((page) => page.hasChanges && page.id !== currentPageId) ||
    state.headerChanged || state.themeChanged || state.blogSettingsChanged ? "site" : "page";
}

export function initialPublishSelection(
  state: SitePublishState,
  currentPageId: string,
  scope: "page" | "site",
): PublishSelection {
  const pendingPages = state.pages.filter((page) => page.hasChanges);
  return scope === "site"
    ? {
        pageIds: pendingPages.map((page) => page.id),
        publishHeader: state.headerChanged,
        publishTheme: state.themeChanged,
        publishBlogSettings: state.blogSettingsChanged,
      }
    : {
        pageIds: pendingPages.some((page) => page.id === currentPageId) ? [currentPageId] : [],
        publishHeader: false,
        publishTheme: false,
        publishBlogSettings: false,
      };
}
