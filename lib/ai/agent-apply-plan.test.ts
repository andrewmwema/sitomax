import { describe, expect, it } from "vitest";
import { planAgentApply, type ApplyMeta, type ApplySiteState } from "./agent-apply-plan";
import { reviewPatches, type AgentReviewChange } from "./agent-review";

const section = (id: string, title: string) => ({ type: id === "footer" ? "Footer" : "Text", props: { id, title } });
function site(): ApplySiteState {
  return {
    theme: { style: "classic" }, header: { version: 1 }, footer: { variant: "columns", tagline: "Shared" },
    pages: [
      { id: "home", slug: "", title: "Home", nav_label: "Home", hide_from_menu: false, seo: {}, sort_order: 0,
        draft_data: { root: { props: { title: "Home" } }, content: [section("hero", "Welcome"), section("about", "About"), section("footer", "Footer")] } },
      { id: "contact", slug: "contact", title: "Contact", nav_label: "Contact", hide_from_menu: false, seo: {}, sort_order: 1,
        draft_data: { root: { props: {} }, content: [section("form", "Write to us")] } },
    ],
    posts: [{ id: "post", title: "Old post", slug: "old-post", draft_content: { version: 1, blocks: [] } }],
  };
}
const meta: ApplyMeta = {
  draftHeader: null,
  pages: {
    home: { draftVersion: "v-home", published: true, rawDraft: { root: { props: { title: "Home" }, readOnly: { title: true } }, content: [] } },
    contact: { draftVersion: "v-contact", published: false, rawDraft: { root: { props: {} }, content: [] } },
  },
  posts: { post: { updatedAt: "2026-01-01T00:00:00.123456+00:00" } },
};

/** Stages edits the way the agent does: each change is the diff from the previous working state. */
function stage(edits: [string, string, (state: ApplySiteState) => void][]) {
  let working = site();
  const changes: AgentReviewChange[] = [];
  for (const [id, kind, edit] of edits) {
    const next = structuredClone(working);
    edit(next);
    changes.push({ id, kind, label: id, patches: reviewPatches(working, next) });
    working = next;
  }
  return changes;
}
const content = (state: ApplySiteState, page: number) => (state.pages[page].draft_data as { content: ReturnType<typeof section>[] }).content;

describe("agent apply plan", () => {
  const changes = stage([
    ["hero", "section_props", (state) => { content(state, 0)[0].props.title = "Premium welcome"; }],
    ["about", "section_props", (state) => { content(state, 0)[1].props.title = "Our story"; }],
    ["faq", "insert_section", (state) => { content(state, 0).splice(1, 0, section("faq", "Questions")); }],
    ["theme", "theme", (state) => { state.theme = { style: "modern" }; }],
    ["footer", "footer", (state) => { state.footer = { variant: "compact", tagline: "Shared" }; }],
    ["page", "create_page", (state) => {
      state.pages.push({ id: "pricing", slug: "pricing", title: "Pricing", nav_label: "Pricing", hide_from_menu: false, seo: {}, sort_order: 2,
        draft_data: { root: { props: { title: "Pricing" } }, content: [] } });
    }],
    ["menu", "page_settings", (state) => { state.pages[0].nav_label = "Start"; }],
    ["contact", "page_settings", (state) => { state.pages[1].title = "Get in touch"; }],
    ["post", "update_blog_post", (state) => { state.posts[0].title = "Better post"; }],
    ["new-post", "create_blog_post", (state) => {
      state.posts.unshift({ id: "new", title: "New post", slug: "new-post", draft_content: { version: 1, blocks: [] } });
    }],
  ]);

  it("rebases kept changes on manual edits, drops the conflicting one and leaves undone changes out", () => {
    const current = site();
    content(current, 0)[1].props.title = "Edited by hand";
    const plan = planAgentApply(current, meta, changes, new Set(["theme"]));

    expect(plan.dropped).toEqual([
      expect.objectContaining({ id: "about", reason: expect.stringContaining("edited after") }),
      expect.objectContaining({ id: "menu", reason: expect.stringContaining("live") }),
    ]);
    expect(plan.items.map((item) => item.key).sort())
      .toEqual(["page:contact", "page:home", "page:pricing", "post:new", "post:post"]);
    const home = plan.items.find((item) => item.key === "page:home");
    expect(home).toMatchObject({ kind: "page", expected_version: "v-home" });
    expect(home).not.toHaveProperty("settings");
    const draft = (home as { draft_data: { root: object; content: ReturnType<typeof section>[] } }).draft_data;
    expect(draft.content.map((item) => [item.props.id, item.props.title])).toEqual([
      ["hero", "Premium welcome"], ["faq", "Questions"], ["about", "Edited by hand"], ["footer", "Footer"],
    ]);
    expect(draft.content[3].props).toMatchObject({ variant: "compact" });
    expect(draft.root).toMatchObject({ readOnly: { title: true } });
  });

  it("drops settings the site cannot store instead of failing the whole apply", () => {
    const invalid = stage([
      ["label", "page_settings", (state) => { state.pages[1].nav_label = "Book a Free Consultation"; }],
      ["reserved", "create_page", (state) => {
        state.pages.push({ id: "login", slug: "login", title: "Login", nav_label: "Login", hide_from_menu: false, seo: {}, sort_order: 2,
          draft_data: { root: { props: {} }, content: [] } });
      }],
      ["title", "page_settings", (state) => { state.pages[1].title = "Get in touch"; }],
    ]);
    const plan = planAgentApply(site(), meta, invalid, new Set());

    expect(plan.dropped).toEqual([
      expect.objectContaining({ id: "label", reason: expect.stringContaining("three words") }),
      expect.objectContaining({ id: "reserved", reason: expect.stringContaining("reserved") }),
    ]);
    expect(plan.items).toEqual([expect.objectContaining({
      key: "page:contact", settings: expect.objectContaining({ title: "Get in touch", nav_label: "Contact" }),
    })]);
  });

  it("writes page settings only where they are not live, and maps every change to the items it touched", () => {
    const plan = planAgentApply(site(), meta, changes, new Set());

    expect(plan.dropped).toEqual([expect.objectContaining({ id: "menu" })]);
    expect(plan.notes).toEqual([expect.stringContaining('"Home"')]);
    expect(plan.items.find((item) => item.key === "theme")).toMatchObject({ expected: { style: "classic" }, after: { style: "modern" } });
    expect(plan.items.find((item) => item.key === "page:contact")).toMatchObject({
      kind: "page", settings: { title: "Get in touch", nav_label: "Contact", hide_from_menu: false, seo: {} },
    });
    expect(plan.items.find((item) => item.key === "page:pricing")).toMatchObject({
      kind: "page_created", settings: { slug: "pricing", title: "Pricing", sort_order: 2 },
    });
    expect(plan.items.find((item) => item.key === "post:post")).toMatchObject({
      kind: "post", expected_updated_at: "2026-01-01T00:00:00.123456+00:00", fields: { title: "Better post", slug: "old-post" },
    });
    expect(plan.items.find((item) => item.key === "post:new")).toMatchObject({ kind: "post_created" });
    expect(Object.fromEntries(plan.changes.map((change) => [change.id, change.items]))).toEqual({
      hero: ["page:home"], about: ["page:home"], faq: ["page:home"], theme: ["theme"], footer: ["page:home"],
      page: ["page:pricing"], contact: ["page:contact"], post: ["post:post"], "new-post": ["post:new"],
    });
  });
});
