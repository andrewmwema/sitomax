import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { BlogManager, type BlogAltEntry, type BlogManagerAuthor, type BlogManagerCategory, type BlogManagerPost, type BlogManagerTag } from "@/components/dashboard/blog-manager";
import type { BlogSettings } from "@/components/dashboard/blog-manager";
import { blogContentSchema, weakAltText } from "@/lib/blog";

const defaultSettings: BlogSettings = {
  blog_path: "/blog", posts_per_page: 10, index_layout: "grid", default_post_layout: "classic",
  show_author: true, show_date: true, show_reading_time: true, show_share_links: true,
  show_in_menu: true, noindex_tags: true, cta_text: "", cta_button_text: "", cta_link: null,
};

export default async function BlogPage({ params }: PageProps<"/dashboard/sites/[siteId]/blog">) {
  const { siteId } = await params;
  const { supabase } = await requireUser();
  const [siteResult, postsResult, categoriesResult, authorsResult, tagsResult, settingsResult] = await Promise.all([
    supabase.from("sites").select("id, name, subdomain, timezone").eq("id", siteId).maybeSingle(),
    supabase.from("posts").select(`
      id, title, slug, excerpt, cover_image, cover_alt, thumbnail_image, thumbnail_alt, draft_content, created_at, updated_at, published_at, publish_at, status, has_unpublished_changes,
      author_id, author:blog_authors(name), category_id, category:post_categories(name),
      post_tag_links(tag:post_tags(name))
    `).eq("site_id", siteId).order("updated_at", { ascending: false }),
    supabase.from("post_categories").select("id, name, slug, description").eq("site_id", siteId).order("name"),
    supabase.from("blog_authors").select("id, name, bio, photo").eq("site_id", siteId).order("name"),
    supabase.from("post_tags").select("id, name").eq("site_id", siteId).order("name"),
    supabase.from("blog_settings").select("*").eq("site_id", siteId).maybeSingle(),
  ]);
  if (!siteResult.data) notFound();
  for (const [label, error] of [
    ["posts", postsResult.error], ["categories", categoriesResult.error], ["authors", authorsResult.error],
    ["tags", tagsResult.error], ["settings", settingsResult.error],
  ] as const) {
    if (error) throw new Error(`Could not load blog ${label}. Apply migration 0029 and retry.`, { cause: error });
  }
  const posts: BlogManagerPost[] = (postsResult.data ?? []).map((row) => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    const category = Array.isArray(row.category) ? row.category[0] : row.category;
    const linkedTags = row.post_tag_links as unknown as ({ tag: { name: string } | null } | null)[] | null;
    return {
      ...row,
      status: row.status as BlogManagerPost["status"],
      author_name: author?.name ?? "",
      category_name: category?.name ?? "",
      tag_names: (linkedTags ?? []).flatMap((link) => link?.tag?.name ? [link.tag.name] : []),
    };
  });
  const altEntries: BlogAltEntry[] = [];
  for (const post of postsResult.data ?? []) {
    if (post.cover_image && weakAltText(post.cover_alt)) altEntries.push({
      postId: post.id, postTitle: post.title, imageUrl: post.cover_image, alt: post.cover_alt, location: "cover",
    });
    if (post.thumbnail_image && weakAltText(post.thumbnail_alt)) altEntries.push({
      postId: post.id, postTitle: post.title, imageUrl: post.thumbnail_image, alt: post.thumbnail_alt, location: "thumbnail",
    });
    const content = blogContentSchema.safeParse(post.draft_content);
    if (content.success) content.data.blocks.forEach((block, blockIndex) => {
      if (block.type === "image" && block.url && weakAltText(block.alt)) altEntries.push({
        postId: post.id, postTitle: post.title, imageUrl: block.url, alt: block.alt, location: "block", blockIndex,
      });
      if (block.type === "gallery") block.images.forEach((image, imageIndex) => {
        if (image.url && weakAltText(image.alt)) altEntries.push({
          postId: post.id, postTitle: post.title, imageUrl: image.url, alt: image.alt, location: "gallery", blockIndex, imageIndex,
        });
      });
    });
  }
  const categories = (categoriesResult.data ?? []) as BlogManagerCategory[];
  const authors = (authorsResult.data ?? []) as BlogManagerAuthor[];
  const tags = (tagsResult.data ?? []) as BlogManagerTag[];
  const settings = { ...defaultSettings, ...(settingsResult.data ?? {}) } as BlogSettings;
  return <BlogManager siteId={siteId} siteName={siteResult.data.name ?? siteResult.data.subdomain}
    subdomain={siteResult.data.subdomain} timezone={siteResult.data.timezone} posts={posts}
    categories={categories} authors={authors} tags={tags} altEntries={altEntries} settings={settings} />;
}
