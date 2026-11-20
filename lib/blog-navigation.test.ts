import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { resolveBlogEditorPage } from "./blog-navigation";

const origin = "a9515f88-38de-4d05-baa8-89e97e57e64e";
const home = "385f7634-95d8-4ed8-bacc-e35c7c25c508";

function pagesClient(originSite: string, hasHome = true) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const { searchParams } = url;
    expect(url.pathname).toBe("/rest/v1/pages");
    const rows = [
      { id: origin, site_id: originSite, slug: "about" },
      ...(hasHome ? [{ id: home, site_id: "site", slug: "" }] : []),
    ].filter((row) => row.site_id === searchParams.get("site_id")?.slice(3) &&
      (!searchParams.has("id") || row.id === searchParams.get("id")?.slice(3)) &&
      (!searchParams.has("slug") || row.slug === searchParams.get("slug")?.slice(3)));
    return Response.json(rows.slice(0, searchParams.has("limit") ? 1 : rows.length));
  });
  return { client: createClient("https://example.test", "key", { global: { fetch }, auth: { persistSession: false } }), fetch };
}

describe("blog editor destination", () => {
  it("uses the exact originating page when it belongs to the site", async () => {
    const { client, fetch } = pagesClient("site");
    await expect(resolveBlogEditorPage(client, "site", origin)).resolves.toBe(origin);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([origin, "https://example.test/editor", undefined])("uses home when the origin %s cannot be used", async (requestedPage) => {
    const { client } = pagesClient("other-site");
    await expect(resolveBlogEditorPage(client, "site", requestedPage)).resolves.toBe(home);
  });

  it("falls back to the first accessible page, or no destination for an empty site", async () => {
    await expect(resolveBlogEditorPage(pagesClient("site", false).client, "site", undefined)).resolves.toBe(origin);
    await expect(resolveBlogEditorPage(pagesClient("other-site", false).client, "site", origin)).resolves.toBeNull();
  });
});
