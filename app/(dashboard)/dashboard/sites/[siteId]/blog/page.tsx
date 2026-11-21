import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { BlogManager, type BlogAltEntry, type BlogManagerAuthor, type BlogManagerCategory, type BlogManagerPost, type BlogManagerTag } from "@/components/dashboard/blog-manager";
import type { BlogSettings } from "@/components/dashboard/blog-manager";
import { blogContentSchema, weakAltText } from "@/lib/blog";
import { resolveBlogEditorPage } from "@/lib/blog-navigation";
import { blogSettingsDraftSchema } from "@/lib/blog-settings";

const defaultSettings: BlogSettings = {
  blog_path: "/blog", posts_per_page: 10, index_layout: "grid", default_post_layout: "classic",
  show_author: true, show_date: true, show_reading_time: true, show_share_links: true,
  show_in_menu: true, noindex_tags: true, cta_text: "", cta_button_text: "", cta_link: null,
};

export default async function BlogPage({ params, searchParams }: PageProps<"/dashboard/sites/[siteId]/blog">) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const { supabase, user } = await requireUser();
  const [siteResult, postsResult, categoriesResult, authorsResult, tagsResult, settingsResult, editorPageId, admin, memberships] = await Promise.all([
    supabase.from("sites").select("id, account_id, name, subdomain, timezone").eq("id", siteId).maybeSingle(),
    supabase.from("posts").select(`
      id, title, slug, excerpt, cover_image, cover_alt, thumbnail_image, thumbnail_alt, draft_content, created_at, updated_at, published_at, publish_at, status, has_unpublished_changes,
      author_id, author:blog_authors(name), category_id, category:post_categories(name),
      post_tag_links!post_tag_links_site_id_post_id_fkey(tag:post_tags!post_tag_links_site_id_tag_id_fkey(name))
    `).eq("site_id", siteId).order("updated_at", { ascending: false }),
    supabase.from("post_categories").select("id, name, slug, description").eq("site_id", siteId).order("name"),
    supabase.from("blog_authors").select("id, name, bio, photo").eq("site_id", siteId).order("name"),
    supabase.from("post_tags").select("id, name").eq("site_id", siteId).order("name"),
    supabase.from("blog_settings").select("*").eq("site_id", siteId).maybeSingle(),
    resolveBlogEditorPage(supabase, siteId, query.editorPage),
    supabase.rpc("is_super_admin"),
    supabase.from("account_members").select("account_id").eq("user_id", user.id).eq("role", "owner"),
  ]);
  for (const [label, error] of [
    ["site", siteResult.error], ["posts", postsResult.error], ["categories", categoriesResult.error], ["authors", authorsResult.error],
    ["tags", tagsResult.error], ["settings", settingsResult.error],
  ] as const) {
    if (error) {
      console.error("Could not load Blog Manager data", { resource: label, code: error.code });
      throw new Error(`Could not load blog ${label}.`, { cause: error });
    }
  }
  if (!siteResult.data) notFound();
  const posts: BlogManagerPost[] = (postsResult.data ?? []).map((row) => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    const category = Array.isArray(row.category) ? row.category[0] : row.category;
    const linkedTags = row.post_tag_links ?? [];
    return {
      ...row,
      status: row.status as BlogManagerPost["status"],
      author_name: author?.name ?? "",
      category_name: category?.name ?? "",
      tag_names: linkedTags.flatMap(({ tag }) => {
        const linkedTag = Array.isArray(tag) ? tag[0] : tag;
        return linkedTag?.name ? [linkedTag.name] : [];
      }),
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
  const draftSettings = blogSettingsDraftSchema.safeParse(settingsResult.data?.draft_settings);
  const settings = { ...defaultSettings, ...(draftSettings.success ? draftSettings.data : settingsResult.data ?? {}) } as BlogSettings;
  const settingsTimezone = draftSettings.success ? draftSettings.data.timezone : siteResult.data.timezone;
  if (admin.error || memberships.error) {
    console.error("Could not check blog analytics access", { code: admin.error?.code ?? memberships.error?.code });
  }
  const canViewAnalytics = admin.data === true || memberships.data?.some(({ account_id }) => account_id === siteResult.data?.account_id) === true;
  return <BlogManager siteId={siteId} editorPageId={editorPageId} siteName={siteResult.data.name ?? siteResult.data.subdomain}
    subdomain={siteResult.data.subdomain} timezone={siteResult.data.timezone} posts={posts}
    categories={categories} authors={authors} tags={tags} altEntries={altEntries} settings={settings}
    settingsTimezone={settingsTimezone} canViewAnalytics={canViewAnalytics} />;
}
