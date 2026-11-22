import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PublishChangesDialog, type PublishDialogState, type PublishResult } from "./publish-changes-dialog";

it("defaults to site-wide publishing and explains page-scoped footer changes", () => {
  const state: PublishDialogState = {
      pages: [
        { id: "home", slug: "", title: "Home", published: true, hasChanges: true, footerChanged: true },
        { id: "about", slug: "about", title: "About", published: false, hasChanges: true, footerChanged: false },
      ],
      headerChanged: true,
      themeChanged: false,
      blogSettingsChanged: true,
      liveUrl: "https://example.test",
  };
  const markup = renderToStaticMarkup(<PublishChangesDialog
    currentPageId="home"
    state={state}
    onClose={vi.fn()}
    onPublish={vi.fn(async (): Promise<PublishResult> => ({ status: "success" as const, message: "Published", liveUrl: "https://example.test" }))}
  />);

  expect(markup).toMatch(/aria-pressed="true"[^>]*>Publish entire site<\/button>/);
  expect(markup).toContain("Footer changes are included with their page.");
  expect(markup).toContain("Includes unpublished footer changes");
  expect(markup).toContain("Blog settings");
  expect(markup).toContain("About · Draft");
});
