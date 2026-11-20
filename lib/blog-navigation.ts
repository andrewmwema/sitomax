import { z } from "zod";
import type { requireUser } from "@/lib/auth";

export function blogPublicPath(blogPath: string, suffix = "") {
  const segments = [...blogPath.split("/").filter(Boolean), ...suffix.split("/").filter(Boolean)];
  return `/${segments.map(encodeURIComponent).join("/")}`;
}

export function blogHref(path: string, suffix = "", preview = false) {
  return `${path.replace(/\/+$/, "")}${suffix ? blogPublicPath(suffix) : ""}${preview ? "?preview=1" : ""}`;
}

export function blogManagerHref(siteId: string, editorPageId: string | null, postId?: string, panel?: "settings") {
  const query = new URLSearchParams();
  if (editorPageId) query.set("editorPage", editorPageId);
  if (panel) query.set("panel", panel);
  return `/dashboard/sites/${encodeURIComponent(siteId)}/blog${postId ? `/${encodeURIComponent(postId)}` : ""}${query.size ? `?${query}` : ""}`;
}

export function blogAnalyticsHref(siteId: string, editorPageId: string | null, days?: string) {
  const query = new URLSearchParams();
  if (editorPageId) query.set("editorPage", editorPageId);
  if (days) query.set("days", days);
  return `/dashboard/sites/${encodeURIComponent(siteId)}/blog/analytics${query.size ? `?${query}` : ""}`;
}

export async function resolveBlogEditorPage(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], siteId: string, requestedPage: unknown,
): Promise<string | null> {
  const parsed = z.uuid().safeParse(requestedPage);
  if (parsed.success) {
    const { data, error } = await supabase.from("pages").select("id")
      .eq("site_id", siteId).eq("id", parsed.data).maybeSingle();
    if (error) console.error("Could not check the originating blog editor page", { code: error.code });
    if (data) return data.id;
  }
  const home = await supabase.from("pages").select("id").eq("site_id", siteId).eq("slug", "").maybeSingle();
  if (home.error) console.error("Could not check the home editor page for the blog", { code: home.error.code });
  if (home.data) return home.data.id;
  const { data, error } = await supabase.from("pages").select("id")
    .eq("site_id", siteId).order("sort_order", { ascending: true }).order("id").limit(1).maybeSingle();
  if (error) console.error("Could not find an editor page for the blog", { code: error.code });
  return data?.id ?? null;
}
