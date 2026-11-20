import "server-only";

import { blogPublicationSchema } from "@/lib/blog";
import { blogPublicPath } from "@/lib/blog-navigation";
import { brand } from "@/lib/brand";
import type { createClient } from "@/lib/supabase/server";
import type { BlogFeedMetadata, BlogFeedPost } from "@/components/blocks/blog-posts";

type Site = { id: string; subdomain: string };

export async function loadEditorBlogFeed(supabase: Awaited<ReturnType<typeof createClient>>, site: Site): Promise<BlogFeedMetadata> {
  const [settings, timezone] = await Promise.all([
    supabase.from("blog_settings").select("blog_path").eq("site_id", site.id).maybeSingle(),
    supabase.from("sites").select("timezone").eq("id", site.id).maybeSingle(),
  ]);
  if (settings.error || timezone.error) throw new Error("Could not load editor blog settings.", { cause: settings.error ?? timezone.error });

  const posts: BlogFeedPost[] = [];
  const batchSize = 500;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await supabase.from("posts")
      .select("id, slug, published_at, metadata:published_content->metadata")
      .eq("site_id", site.id).eq("status", "published").not("published_content", "is", null)
      .order("published_at", { ascending: false }).order("id").range(offset, offset + batchSize - 1);
    if (error) throw new Error("Could not load published posts in the editor.", { cause: error });
    for (const row of data) {
      const parsed = blogPublicationSchema.shape.metadata.safeParse(row.metadata);
      if (!parsed.success || typeof row.published_at !== "string" || !Number.isFinite(Date.parse(row.published_at))) {
        console.warn("Skipping invalid published blog card in the editor.", { siteId: site.id, postId: row.id });
        continue;
      }
      const { title, excerpt, cover_image, thumbnail_image, category, author, featured, reading_minutes } = parsed.data;
      posts.push({
        id: row.id, slug: row.slug, published_at: row.published_at, featured,
        publication: { metadata: { title, excerpt, cover_image, thumbnail_image, category, author: author && { name: author.name }, reading_minutes } },
      });
    }
    if (data.length < batchSize) break;
  }
  return {
    siteBlogPosts: posts,
    siteBlogPath: `${brand.appUrl}/s/${encodeURIComponent(site.subdomain)}${blogPublicPath(settings.data?.blog_path ?? "/blog")}`,
    siteBlogPreview: true,
    siteBlogTimezone: timezone.data?.timezone ?? "UTC",
  };
}
