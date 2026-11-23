import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeToolResult } from "@/lib/ai/agent";
import { validateApplyItems } from "@/lib/ai/agent-apply";
import { planAgentApply, type ApplyMeta } from "@/lib/ai/agent-apply-plan";
import { createAgentReviewPayload } from "@/lib/ai/agent-review";
import { EDITOR_DRAFT_SOURCE, editorDraft, editorPuckData } from "@/lib/editor/initial-data";
import { defaultHeader } from "@/lib/header";
import { hasUnpublishedPageChanges } from "@/lib/publishing";
import { fixtureBusiness, fixtureChangeset, fixtureIds } from "@/test/fixtures/agent-site";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));

/**
 * Runs against the local test database of scripts/test-db.sh, and only when
 * TEST_DATABASE_URL names it. Everything happens in one transaction that is
 * rolled back, as the signed-in site member, so access rules apply.
 */
const LOCAL_URL = "postgresql://sitomax_test@127.0.0.1:55439/sitomax_test";
const requested = process.env.TEST_DATABASE_URL;
const state = fileURLToPath(new URL("../../.test-db", import.meta.url));

function runSql(sql: string): Record<string, unknown> {
  if (requested !== LOCAL_URL) throw new Error(`TEST_DATABASE_URL must be exactly ${LOCAL_URL}`);
  const output = execFileSync(path.join(state, "install/usr/lib/postgresql/17/bin/psql"),
    [LOCAL_URL, "-w", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: sql, encoding: "utf8", env: { ...process.env, PGPASSFILE: path.join(state, "pgpass") } });
  // Labelled rows are "label<TAB>json"; anything else is command output.
  return Object.fromEntries(output.split("\n").flatMap((line) => {
    const tab = line.indexOf("\t");
    return tab > 0 ? [[line.slice(0, tab), JSON.parse(line.slice(tab + 1)) as unknown]] : [];
  }));
}
function json(value: unknown) {
  const text = JSON.stringify(value);
  if (text.includes("$json$")) throw new Error("Fixture text cannot contain the SQL quote tag.");
  return `$json$${text}$json$::jsonb`;
}
const columns = (list: string, alias: string) => list.split(",").map((name) => `${alias}.${name.trim()}`).join(", ");
/** The editor's read of one page: the draft columns it names, plus the live ones it compares them with. */
function loadDraft(label: string, pageId: string) {
  return `select '${label}' || chr(9) || row_to_json(loaded)::text from (
    select ${columns(EDITOR_DRAFT_SOURCE.page, "p")}, p.published_data,
      (select row_to_json(site) from (
        select ${columns(EDITOR_DRAFT_SOURCE.site, "s")}, s.published_header from public.sites s where s.id = p.site_id
      ) site) as site
    from public.pages p where p.id = '${pageId}') loaded;`;
}

type LoadedSite = { theme: Record<string, unknown> | null; draft_theme: Record<string, unknown> | null; draft_header: unknown; published_header: unknown };
type Loaded = { seo: unknown; draft_data: unknown; draft_version: string; published_data: unknown; site: LoadedSite };
type Block = { type: string; props: Record<string, unknown> };

/** What the editor shows for a loaded row: the same two steps as opening /editor/[pageId]. */
function opened(row: Loaded) {
  const draft = editorDraft(row, row.site);
  const data = editorPuckData(draft.data, {
    headersReady: true, pageTitle: "Home", draftHeader: draft.draftHeader,
    fallbackHeader: () => defaultHeader(fixtureBusiness.businessName),
  });
  const root = data.root.props as { __editorHeader?: { desktop: Record<string, unknown> } };
  return {
    theme: draft.theme, version: draft.version, header: root.__editorHeader,
    hero: (data.content as Block[]).find((block) => block.props.id === "home-hero")?.props,
    unpublished: hasUnpublishedPageChanges(row.draft_data, row.published_data),
  };
}

describe.skipIf(!requested)("AI agent apply and the editor's draft loader", () => {
  it("shows applied theme, header and section changes in the editor, and the originals after undo", async () => {
    const owner = "12000000-0000-4000-8000-000000000001";
    const thread = "62000000-0000-4000-8000-000000000001";
    const run = "72000000-0000-4000-8000-000000000001";
    const changeset = fixtureChangeset();
    changeset.baseline.posts = [];
    changeset.working.posts = [];
    const current = structuredClone(changeset.baseline);
    const versions = Object.fromEntries(current.pages.map((page, index) =>
      [page.id, `42000000-0000-4000-8000-00000000000${index + 1}`]));

    // Staged with the agent's own tools, numbers written the way models write them.
    const context = { accountId: fixtureIds.account, siteId: fixtureIds.site } as Parameters<typeof makeToolResult>[3];
    await makeToolResult("update_theme", { patch: { radius: "8px", buttonStyle: "rounded" } }, changeset, context);
    await makeToolResult("update_header", { header: { desktop: { height: "80px", shadow: true } } }, changeset, context);
    await makeToolResult("update_section_props",
      { pageId: fixtureIds.home, sectionId: "home-hero", props: { heading: "Plumbing, done beautifully" } }, changeset, context);

    const meta: ApplyMeta = {
      draftHeader: null, posts: {},
      pages: Object.fromEntries(current.pages.map((page) =>
        [page.id, { draftVersion: versions[page.id], published: page.id === fixtureIds.home, rawDraft: page.draft_data }])),
    };
    const plan = planAgentApply(current, meta, createAgentReviewPayload(changeset)!.changes, new Set());
    plan.items = validateApplyItems(plan.items);
    expect(plan.dropped).toEqual([]);
    expect(plan.items.map((item) => item.key).sort()).toEqual(["header", `page:${fixtureIds.home}`, "theme"]);

    const result = runSql(`
      begin;
      insert into auth.users(id, email, raw_user_meta_data) values ('${owner}', 'owner@agent-editor.test', '{}');
      insert into public.accounts(id, name) values ('${fixtureIds.account}', 'Agent editor test');
      insert into public.account_members values ('${fixtureIds.account}', '${owner}', 'owner');
      insert into public.sites(id, account_id, subdomain, name, theme) values
        ('${fixtureIds.site}', '${fixtureIds.account}', 'agent-editor-test', ${json(current.site.name)}#>>'{}', ${json(current.theme)});
      ${current.pages.map((page) => `
      insert into public.pages(id, site_id, slug, title, nav_label, hide_from_menu, seo, sort_order, draft_data, draft_version,
          published_data, published_at)
        select '${page.id}', '${fixtureIds.site}', ${json(page.slug)}#>>'{}', ${json(page.title)}#>>'{}', ${json(page.nav_label)}#>>'{}',
          false, ${json(page.seo)}, ${page.sort_order}, draft, '${versions[page.id]}',
          ${page.id === fixtureIds.home ? "draft, clock_timestamp() - interval '1 day'" : "null, null"}
        from (select ${json(page.draft_data)} as draft) source;`).join("")}
      insert into public.ai_agent_threads(id, site_id, user_id, title) values
        ('${thread}', '${fixtureIds.site}', '${owner}', 'Make the site feel more premium');
      insert into public.ai_agent_runs(id, thread_id, status) values ('${run}', '${thread}', 'completed');

      select set_config('request.jwt.claim.sub', '${owner}', true);
      set local role authenticated;
      ${loadDraft("before", fixtureIds.home)}
      select public.apply_ai_agent_changes('${run}', 'Make the site feel more premium', ${json(plan.changes)}, ${json(plan.items)}) as apply_id \\gset
      ${loadDraft("applied", fixtureIds.home)}
      select 'history' || chr(9) || json_agg(history)::text from public.list_ai_agent_applies('${fixtureIds.site}') history;
      select 'undo' || chr(9) || public.undo_ai_agent_apply(:'apply_id')::text;
      ${loadDraft("undone", fixtureIds.home)}
      reset role;
      rollback;
    `) as { before: Loaded; applied: Loaded; undone: Loaded; history: unknown; undo: unknown };

    const before = opened(result.before);
    expect(before).toMatchObject({ theme: current.theme, version: versions[fixtureIds.home], unpublished: false,
      hero: { heading: "Plumbing done properly" } });

    // Apply: the editor's own read returns every new value, under a new draft version.
    const applied = opened(result.applied);
    expect(applied.theme).toEqual({ ...current.theme, radius: 8, buttonStyle: "rounded" });
    expect(applied.header?.desktop).toMatchObject({ height: 80, shadow: true });
    expect(applied.hero).toMatchObject({ heading: "Plumbing, done beautifully" });
    expect(applied.version).not.toBe(before.version);
    expect(applied.unpublished).toBe(true);
    expect(result.history).toMatchObject([{ summary: "Make the site feel more premium", change_count: 3, can_undo: true }]);
    // Nothing live changed, so the theme and header count as unpublished too.
    expect(result.applied.site.theme).toEqual(current.theme);
    expect(result.applied.site.published_header).toBeNull();
    expect(result.applied.published_data).toEqual(result.before.published_data);

    // Undo: the same read returns the originals, again under a new draft version.
    expect(result.undo).toMatchObject({ undone: 3, skipped: 0 });
    const undone = opened(result.undone);
    expect(result.undone.draft_data).toEqual(result.before.draft_data);
    expect(result.undone.site).toEqual(result.before.site);
    expect(undone).toEqual({ ...before, version: undone.version });
    expect([before.version, applied.version]).not.toContain(undone.version);
  });
});
