import { z } from "zod";
import type { requireUser } from "@/lib/auth";

export function blogManagerHref(siteId: string, editorPageId: string | null, postId?: string, panel?: "settings") {
  const query = new URLSearchParams();
  if (editorPageId) query.set("editorPage", editorPageId);
  if (panel) query.set("panel", panel);
  return `/dashboard/sites/${encodeURIComponent(siteId)}/blog${postId ? `/${encodeURIComponent(postId)}` : ""}${query.size ? `?${query}` : ""}`;
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
