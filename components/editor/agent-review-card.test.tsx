import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultHeader } from "@/lib/header";

const mocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("@puckeditor/core", () => ({
  Render: ({ data }: { data: unknown }) => { mocks.render(data); return <div>Canvas</div>; },
}));
vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));

import { AgentReviewCanvas, newAgentReview } from "./agent-review-card";

function review(draftData: unknown) {
  const snapshot = {
    pages: [{ id: "home", title: "Home", draft_data: draftData }],
    theme: {},
    header: defaultHeader(),
    footer: {},
  };
  return newAgentReview({ changes: [], baseline: snapshot, working: snapshot });
}

describe("agent review canvas data", () => {
  beforeEach(() => mocks.render.mockClear());

  it("renders validated sections and zones with a stable preview footer id", () => {
    const markup = renderToStaticMarkup(<AgentReviewCanvas pageId="home" review={review({
      root: { props: { title: "Home" } },
      content: [{ type: "Hero", props: { id: "hero", title: "Hello" } }],
      zones: { "hero:children": [{ type: "Text", props: { id: "text" } }] },
    })} />);

    expect(markup).toContain("Canvas");
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      content: [
        { type: "Hero", props: { id: "hero", title: "Hello" } },
        { type: "Footer", props: { id: "agent-review-footer-home" } },
      ],
      zones: { "hero:children": [{ type: "Text", props: { id: "text" } }] },
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
