import { describe, expect, it } from "vitest";
import {
  defaultPublishScope,
  hasUnpublishedFooterChanges,
  hasUnpublishedPageChanges,
  initialPublishSelection,
  publishChangeCount,
  type SitePublishState,
} from "./publishing";

const page = (id: string, hasChanges = true, footerChanged = false) => ({ id, hasChanges, footerChanged });

describe("site publishing state", () => {
  it("counts pending pages and shared settings once each", () => {
    expect(publishChangeCount({
      pages: [page("home"), page("about", false)],
      headerChanged: true,
      themeChanged: false,
      blogSettingsChanged: true,
    })).toBe(3);
  });

  it("defaults to the current page unless another page or shared setting is pending", () => {
    const currentOnly: SitePublishState = {
      pages: [page("home"), page("about", false)],
      headerChanged: false,
      themeChanged: false,
      blogSettingsChanged: false,
    };
    expect(defaultPublishScope(currentOnly, "home")).toBe("page");
    const siteChanges = { ...currentOnly, headerChanged: true };
    expect(defaultPublishScope(siteChanges, "home")).toBe("site");
    expect(initialPublishSelection(siteChanges, "home", "site")).toEqual({
      pageIds: ["home"],
      publishHeader: true,
      publishTheme: false,
      publishBlogSettings: false,
    });
  });

  it("includes the page footer in that page's publish selection", () => {
    const state: SitePublishState = {
      pages: [page("home", true, true)],
      headerChanged: false,
      themeChanged: false,
      blogSettingsChanged: false,
    };
    expect(initialPublishSelection(state, "home", "page").pageIds).toEqual(["home"]);
  });

  it("detects never-published pages and footer-only differences", () => {
    const live = { content: [{ type: "Footer", props: { text: "Old" } }] };
    const draft = { content: [{ type: "Footer", props: { text: "New" } }] };
    expect(hasUnpublishedPageChanges(draft, null)).toBe(true);
    expect(hasUnpublishedFooterChanges(draft, live)).toBe(true);
    expect(hasUnpublishedFooterChanges(live, live)).toBe(false);
  });

  it("does not mistake transient editor header metadata for a page content change", () => {
    const published = { root: { props: { title: "Home" } }, content: [] };
    const draft = { root: { props: { title: "Home", __editorHeader: { version: 1 } } }, content: [] };
    expect(hasUnpublishedPageChanges(draft, published)).toBe(false);
  });
});
