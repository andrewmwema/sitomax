import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  changePageSlug, createSitePage, deleteSitePage, duplicateSitePage, renameSitePage, reorderSitePages, setSiteHomePage, slugError, uniqueSlug,
} from "./site-pages";
import { linkContext, resolveLink } from "./links";

type Row = Record<string, unknown>;
const SITE = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;

/** Minimal in-memory stand-in for the supabase-js query builder. */
function fakeSupabase(tables: Record<string, Row[]>) {
  let nextId = 50;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: [string, unknown][] = [];
    let op: { kind: "select" } | { kind: "update"; values: Row } | { kind: "delete" } | { kind: "insert"; values: Row } | { kind: "upsert"; values: Row } = { kind: "select" };
    const matches = (row: Row) => filters.every(([key, value]) => row[key] === value);
    const run = () => {
      if (op.kind === "insert") {
        const values = op.values;
        if (rows.some((row) => row.site_id === values.site_id && row.slug === values.slug)) return { data: null, error: { code: "23505" } };
        const row = { id: id(nextId++), ...values };
        rows.push(row);
        return { data: [row], error: null };
      }
      if (op.kind === "upsert") {
        const values = op.values;
        const existing = rows.find((row) => row.site_id === values.site_id && row.from_path === values.from_path);
        if (existing) Object.assign(existing, values); else rows.push({ ...values });
        return { data: null, error: null };
      }
      const hit = rows.filter(matches);
      if (op.kind === "update") {
        const values = op.values;
        if (table === "pages" && "slug" in values && rows.some((row) => !hit.includes(row) && row.site_id === hit[0]?.site_id && row.slug === values.slug)) {
          return { data: null, error: { code: "23505" } };
        }
        hit.forEach((row) => Object.assign(row, structuredClone(values)));
      }
      if (op.kind === "delete") hit.forEach((row) => rows.splice(rows.indexOf(row), 1));
      return { data: structuredClone(hit), error: null };
    };
    const builder = {
      select: () => builder,
      insert: (values: Row) => { op = { kind: "insert", values }; return builder; },
      upsert: (values: Row) => { op = { kind: "upsert", values }; return builder; },
      update: (values: Row) => { op = { kind: "update", values }; return builder; },
      delete: () => { op = { kind: "delete" }; return builder; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
      order: () => builder,
      maybeSingle: async () => { const { data, error } = run(); return { data: data?.[0] ?? null, error }; },
      single: async () => { const { data, error } = run(); return { data: data?.[0] ?? null, error }; },
      then: (resolve: (value: unknown) => void) => {
        const result = run();
        if (op.kind === "select") result.data?.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
        resolve(result);
      },
    };
    return builder;
  };
  return { from } as never;
}

function site() {
  const tables = {
    pages: [
      { id: id(1), site_id: SITE, slug: "", title: "Home", sort_order: 0, draft_data: { content: [{ type: "Hero", props: { buttonLink: "/services#top", typed: { type: "page", pageId: id(2) } } }], root: { props: { title: "Home" } } } },
      { id: id(2), site_id: SITE, slug: "services", title: "Services", sort_order: 1, draft_data: { content: [], root: { props: { title: "Services" } } } },
      { id: id(3), site_id: SITE, slug: "contact", title: "Contact", sort_order: 2, draft_data: { content: [{ type: "Text", props: { text: '<a href="/services">s</a>' } }], root: { props: {} } } },
    ] as Row[],
    redirects: [
      { site_id: SITE, from_path: "/what-we-do", to_path: "/old" },
      { site_id: SITE, from_path: "/legacy", to_path: "/services" },
    ] as Row[],
  };
  return { tables, supabase: fakeSupabase(tables) };
}

describe("slug rules", () => {
  it("rejects reserved, duplicate and malformed slugs", () => {
    expect(slugError("dashboard")).toMatch(/reserved/);
    expect(slugError("api")).toMatch(/reserved/);
    expect(slugError("about", ["about"])).toMatch(/already/);
    expect(slugError("About Us")).toMatch(/lowercase/);
    expect(slugError("about-us")).toBeNull();
    expect(uniqueSlug("Login", [])).toBe("login-page");
    expect(uniqueSlug("Services", ["services"])).toBe("services-2");
  });
});

describe("page management", () => {
  it("creates blank pages and copies of existing pages", async () => {
    const { tables, supabase } = site();
    const blank = await createSitePage(supabase, { siteId: SITE, title: "About Us" });
    expect(blank).toMatchObject({ status: "success", slug: "about-us" });
    const copy = await createSitePage(supabase, { siteId: SITE, title: "Offer", slug: "offer", copyFromPageId: id(1) });
    const row = tables.pages.find((page) => page.id === (copy as { pageId: string }).pageId)!;
    expect(row).toMatchObject({ slug: "offer", sort_order: 4 });
    expect(row.draft_data).toMatchObject({ content: [{ type: "Hero" }], root: { props: { title: "Offer" } } });
    expect(await createSitePage(supabase, { siteId: SITE, title: "X", slug: "editor" })).toMatchObject({ status: "error" });
  });

  it("creates the homepage when a site has none", async () => {
    const tables = { pages: [] as Row[] };
    expect(await createSitePage(fakeSupabase(tables), { siteId: SITE, title: "Welcome" })).toMatchObject({ status: "success", slug: "" });
  });

  it("duplicates a page right after its source", async () => {
    const { tables, supabase } = site();
    const result = await duplicateSitePage(supabase, id(2));
    expect(result).toMatchObject({ status: "success", slug: "services-copy" });
    const ordered = [...tables.pages].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((page) => page.slug);
    expect(ordered).toEqual(["", "services", "services-copy", "contact"]);
  });

  it("never deletes the homepage", async () => {
    const { tables, supabase } = site();
    expect(await deleteSitePage(supabase, id(1))).toMatchObject({ status: "error" });
    expect(await deleteSitePage(supabase, id(3))).toMatchObject({ status: "success" });
    expect(tables.pages.map((page) => page.id)).toEqual([id(1), id(2)]);
  });

  it("changes a slug: page-id links follow, legacy links are rewritten, and a 301 is offered", async () => {
    const { tables, supabase } = site();
    const result = await changePageSlug(supabase, id(2), "what-we-do", { redirect: true, skipDraftOf: id(3) });
    expect(result).toMatchObject({ status: "success", slug: "what-we-do", rewrittenLinks: 1 });
    const home = tables.pages[0].draft_data as { content: { props: Record<string, unknown> }[] };
    expect(home.content[0].props.buttonLink).toBe("/what-we-do#top");
    // The open editor page is left for the client to rewrite in memory.
    expect(JSON.stringify(tables.pages[2].draft_data)).toContain('href=\\"/services\\"');
    expect(resolveLink(home.content[0].props.typed, linkContext(tables.pages as { id: string; slug: string }[])).href).toBe("/what-we-do");
    expect(tables.redirects).toEqual([
      { site_id: SITE, from_path: "/legacy", to_path: "/what-we-do" },
      { site_id: SITE, from_path: "/services", to_path: "/what-we-do" },
    ]);
  });

  it("rejects slugs used by another page or reserved by the platform", async () => {
    const { supabase } = site();
    expect(await changePageSlug(supabase, id(2), "contact", { redirect: false })).toMatchObject({ status: "error" });
    expect(await changePageSlug(supabase, id(2), "login", { redirect: false })).toMatchObject({ status: "error" });
    expect(await changePageSlug(supabase, id(1), "home", { redirect: false })).toMatchObject({ status: "error" });
  });

  it("renames the draft root title so publishing keeps the new name", async () => {
    const { tables, supabase } = site();
    await renameSitePage(supabase, id(2), "Our services");
    expect(tables.pages[1]).toMatchObject({ title: "Our services", draft_data: { root: { props: { title: "Our services" } } } });
  });

  it("reorders with the full page list only and swaps the homepage", async () => {
    const { tables, supabase } = site();
    expect(await reorderSitePages(supabase, SITE, [id(3), id(1)])).toMatchObject({ status: "error" });
    expect(await reorderSitePages(supabase, SITE, [id(3), id(1), id(2)])).toMatchObject({ status: "success" });
    expect(tables.pages.map((page) => page.sort_order)).toEqual([1, 2, 0]);
    expect(await setSiteHomePage(supabase, id(3))).toMatchObject({ status: "success" });
    expect(tables.pages.map((page) => page.slug)).toEqual(["contact", "services", ""]);
  });
});
