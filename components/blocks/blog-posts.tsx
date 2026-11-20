import type { ComponentConfig, PuckContext } from "@puckeditor/core";
import type { PublicBlogPost } from "@/lib/blog-public";
import { BlogPostCard } from "@/components/blocks/blog-post-card";
import { BlogArchive, type BlogArchiveProps } from "@/components/blocks/blog-archive";

export type BlogPostsProps = {
  source: "latest" | "featured" | "category";
  category: string;
  count: number;
  variant: "grid" | "list" | "carousel" | "featured-list";
  showExcerpt: boolean;
  showDate: boolean;
  showAuthor: boolean;
  showViewAll: boolean;
  archiveData?: BlogArchiveProps;
};

type BlogFeedMetadata = {
  siteBlogPosts?: PublicBlogPost[];
  siteBlogPath?: string;
  siteBlogTimezone?: string;
};

function renderBlogPosts(props: BlogPostsProps & { puck: PuckContext }) {
  if (props.archiveData) return <BlogArchive {...props.archiveData} />;
  const metadata = props.puck.metadata as BlogFeedMetadata | undefined;
  let posts = metadata?.siteBlogPosts ?? [];
  if (props.source === "featured") posts = posts.filter((post) => post.featured);
  if (props.source === "category") posts = posts.filter((post) => post.publication.metadata.category?.slug === props.category);
  posts = posts.slice(0, Math.max(1, Math.min(20, props.count)));
  const path = metadata?.siteBlogPath ?? "/blog";
  if (!posts.length) return <p className="mx-auto max-w-3xl py-10 text-center text-sm text-[var(--color-muted)]">
    {props.puck.isEditing ? "Published posts will appear here." : ""}
  </p>;

  const featured = props.variant === "featured-list" ? posts[0] : null;
  const remaining = featured ? posts.slice(1) : posts;
  const layout = props.variant === "list" ? "list" : "grid";
  return <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8" aria-label="Blog posts">
    {featured ? <div className="mb-8 grid gap-6 rounded-2xl bg-[var(--color-soft-bg)] p-5 md:grid-cols-2 md:items-center">
      <BlogPostCard post={featured} blogPath={path} showExcerpt={props.showExcerpt} showDate={props.showDate}
        showAuthor={props.showAuthor} timezone={metadata?.siteBlogTimezone} />
      {remaining.length ? <div className="grid gap-6">{remaining.map((post) => <BlogPostCard key={post.id} post={post}
        blogPath={path} layout="list" showExcerpt={props.showExcerpt} showDate={props.showDate}
        showAuthor={props.showAuthor} timezone={metadata?.siteBlogTimezone} />)}</div> : null}
    </div> : null}
    {remaining.length ? <div className={props.variant === "carousel"
      ? "flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4"
      : layout === "list" ? "grid gap-8" : "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"}>
      {remaining.map((post) => <div key={post.id} className={props.variant === "carousel" ? "min-w-[min(85vw,24rem)] snap-start" : ""}>
        <BlogPostCard post={post} blogPath={path} layout={layout} showExcerpt={props.showExcerpt} showDate={props.showDate}
          showAuthor={props.showAuthor} timezone={metadata?.siteBlogTimezone} />
      </div>)}
    </div> : null}
    {props.showViewAll ? <div className="mt-8 text-center"><a href={path}
      className="inline-flex min-h-11 items-center rounded-lg border border-current px-5 font-medium hover:bg-[var(--color-soft-bg)]">View all posts</a></div> : null}
  </section>;
}

export const BlogPosts: ComponentConfig<BlogPostsProps> = {
  label: "Blog posts",
  fields: {
    source: { type: "select", label: "Posts", options: [
      { label: "Latest", value: "latest" }, { label: "Featured", value: "featured" }, { label: "By category", value: "category" },
    ] },
    category: { type: "text", label: "Category slug" },
    count: { type: "number", label: "Number of posts", min: 1, max: 20 },
    variant: { type: "select", label: "Layout", options: [
      { label: "Cards grid", value: "grid" }, { label: "List", value: "list" },
      { label: "Carousel", value: "carousel" }, { label: "Featured + list", value: "featured-list" },
    ] },
    showExcerpt: { type: "radio", label: "Show excerpt", options: [{ label: "Yes", value: true }, { label: "No", value: false }] },
    showDate: { type: "radio", label: "Show date", options: [{ label: "Yes", value: true }, { label: "No", value: false }] },
    showAuthor: { type: "radio", label: "Show author", options: [{ label: "Yes", value: true }, { label: "No", value: false }] },
    showViewAll: { type: "radio", label: "View all button", options: [{ label: "Yes", value: true }, { label: "No", value: false }] },
  },
  defaultProps: {
    source: "latest", category: "", count: 3, variant: "grid",
    showExcerpt: true, showDate: true, showAuthor: true, showViewAll: true,
  },
  render: renderBlogPosts,
};
