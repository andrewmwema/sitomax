import { notFound } from "next/navigation";
import { BlogPostEditor } from "@/components/dashboard/blog-post-editor";
import type { BlogManagerAuthor, BlogManagerCategory, BlogManagerPost, BlogManagerTag } from "@/components/dashboard/blog-manager";
import { requireUser } from "@/lib/auth";
import { blogPostFieldsSchema } from "@/lib/blog";
import { resolveBlogEditorPage } from "@/lib/blog-navigation";
import { themeFonts } from "@/lib/theme/presets";

export default async function BlogPostPage({ params, searchParams }: PageProps<"/dashboard/sites/[siteId]/blog/[postId]">) {
  const [{ siteId, postId }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireUser();
  const [siteResult, postResult, categoriesResult, authorsResult, tagsResult, tagLinksResult, postsResult, editorPageId] = await Promise.all([
    supabase.from("sites").select("id, timezone, theme").eq("id", siteId).maybeSingle(),
    supabase.from("posts").select("*").eq("site_id", siteId).eq("id", postId).maybeSingle(),
    supabase.from("post_categories").select("id, name, slug, description").eq("site_id", siteId).order("name"),
    supabase.from("blog_authors").select("id, name, bio, photo").eq("site_id", siteId).order("name"),
    supabase.from("post_tags").select("id, name").eq("site_id", siteId).order("name"),
    supabase.from("post_tag_links").select("tag_id").eq("post_id", postId),
    supabase.from("posts").select("id, title").eq("site_id", siteId).order("updated_at", { ascending: false }),
    resolveBlogEditorPage(supabase, siteId, query.editorPage),
  ]);
  if (!siteResult.data || !postResult.data) notFound();
  for (const [label, error] of [
    ["categories", categoriesResult.error], ["authors", authorsResult.error], ["tags", tagsResult.error],
    ["post tags", tagLinksResult.error], ["posts", postsResult.error],
  ] as const) {
    if (error) throw new Error(`Could not load blog ${label}. Apply migration 0029 and retry.`, { cause: error });
  }
  const post = postResult.data;
  const parsedPost = blogPostFieldsSchema.safeParse({
    title: post.title, subtitle: post.subtitle, slug: post.slug, excerpt: post.excerpt,
    draft_content: post.draft_content, cover_image: post.cover_image, cover_alt: post.cover_alt,
    thumbnail_image: post.thumbnail_image, thumbnail_alt: post.thumbnail_alt, author_id: post.author_id,
    category_id: post.category_id, tag_ids: (tagLinksResult.data ?? []).map(({ tag_id }) => tag_id),
    featured: post.featured, layout_override: post.layout_override, seo_title: post.seo_title,
    seo_description: post.seo_description, canonical_url: post.canonical_url, noindex: post.noindex,
  });
  if (!parsedPost.success) throw new Error("This post contains invalid draft data.", { cause: parsedPost.error });
  const [headingFont, bodyFont] = themeFonts(siteResult.data.theme);
  return <BlogPostEditor key={postId} siteId={siteId} editorPageId={editorPageId} postId={postId} post={parsedPost.data}
    initialTab={query.panel === "settings" ? "details" : "status"}
    headingFont={headingFont} bodyFont={bodyFont}
    status={post.status as "draft" | "scheduled" | "published"} publishedAt={post.published_at}
    publishAt={post.publish_at} hasScheduledSnapshot={post.scheduled_content != null} hasUnpublishedChanges={post.has_unpublished_changes}
    timezone={siteResult.data.timezone}
    categories={(categoriesResult.data ?? []) as BlogManagerCategory[]}
    authors={(authorsResult.data ?? []) as BlogManagerAuthor[]}
    tags={(tagsResult.data ?? []) as BlogManagerTag[]}
    adjacentPosts={(postsResult.data ?? []) as Pick<BlogManagerPost, "id" | "title">[]} />;
}
