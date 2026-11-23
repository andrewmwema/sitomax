import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultHeader } from "@/lib/header";

const mocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("@puckeditor/core", () => ({
  Render: ({ data }: { data: unknown }) => { mocks.render(data); return <div>Canvas</div>; },
}));
vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));

import { AgentReviewCanvas, newAgentReview } from "./agent-review-card";

function review(draftData: unknown, footerVariant?: { before: string; after: string }) {
  const snapshot = {
    pages: [{ id: "home", title: "Home", draft_data: draftData }],
    theme: {},
    header: defaultHeader(),
  };
  const footer = (variant?: string) => variant ? { tagline: "Shared", variant } : {};
  return newAgentReview({
    changes: footerVariant ? [{ id: "footer", kind: "footer", label: "Update site footer", patches: [{
      path: ["footer", "variant"],
      before: { present: true, value: footerVariant.before }, after: { present: true, value: footerVariant.after },
    }] }] : [],
    baseline: { ...snapshot, footer: footer(footerVariant?.before) },
    working: { ...snapshot, footer: footer(footerVariant?.after) },
  });
}

describe("agent review canvas data", () => {
  beforeEach(() => mocks.render.mockClear());

  it("renders validated sections and zones without inventing a footer", () => {
    const markup = renderToStaticMarkup(<AgentReviewCanvas pageId="home" review={review({
      root: { props: { title: "Home" } },
      content: [{ type: "Hero", props: { id: "hero", title: "Hello" } }],
      zones: { "hero:children": [{ type: "Text", props: { id: "text" } }] },
    })} />);

    expect(markup).toContain("Canvas");
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      content: [{ type: "Hero", props: { id: "hero", title: "Hello" } }],
      zones: { "hero:children": [{ type: "Text", props: { id: "text" } }] },
    }));
  });

  it("previews only the changed footer fields on the page's own footer, as applying does", () => {
    renderToStaticMarkup(<AgentReviewCanvas pageId="home" review={review({
      root: {}, content: [{ type: "Footer", props: { id: "footer", tagline: "Page tagline", variant: "columns" } }],
    }, { before: "columns", after: "compact" })} />);

    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      content: [{ type: "Footer", props: { id: "footer", tagline: "Page tagline", variant: "compact" } }],
    }));
  });

  it("reports invalid sections instead of passing them to the renderer", () => {
    const markup = renderToStaticMarkup(<AgentReviewCanvas pageId="home" review={review({
      root: {}, content: [{ type: "Hero", props: {} }],
    })} />);

    expect(markup).toContain("invalid preview data");
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
