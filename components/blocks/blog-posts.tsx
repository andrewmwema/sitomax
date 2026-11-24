import type { ComponentConfig, PuckContext } from "@puckeditor/core";
import { BlogPostCard, type BlogCardPost } from "@/components/blocks/blog-post-card";
import { BlogArchive, type BlogArchiveProps } from "@/components/blocks/blog-archive";
import { blogHref } from "@/lib/blog-navigation";
import { designField, richHeadingField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { RichHeading } from "./ui/heading";
import { isRichHeading } from "@/lib/richtext";

export type BlogPostsProps = {
  design?: BlockDesign;
  heading?: string;
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

export type BlogFeedPost = BlogCardPost & { featured: boolean };

export type BlogFeedMetadata = {
  siteBlogPosts?: BlogFeedPost[];
  siteBlogPath?: string;
  siteBlogPreview?: boolean;
  siteBlogTimezone?: string;
  siteBlogSettingsPending?: boolean;
  siteBlogFeedUnavailable?: boolean;
};

function renderBlogPosts(props: BlogPostsProps & { puck: PuckContext }) {
  if (props.archiveData) return <BlogArchive {...props.archiveData} />;
  const metadata = props.puck.metadata as BlogFeedMetadata | undefined;
  let posts = metadata?.siteBlogPosts ?? [];
  if (props.source === "featured") posts = posts.filter((post) => post.featured);
  if (props.source === "category") posts = posts.filter((post) => post.publication.metadata.category?.slug === props.category);
  posts = posts.slice(0, Math.max(1, Math.min(20, props.count)));
  const path = metadata?.siteBlogPath ?? "/blog";
  const preview = metadata?.siteBlogPreview;
  const heading = props.heading ?? "Latest from the blog";
  if (!posts.length && !props.puck.isEditing) return <></>;
  const emptyMessage = metadata?.siteBlogFeedUnavailable ? "Blog preview unavailable. Reload the editor to try again."
    : props.source === "featured" ? "Publish a featured post to preview it here."
    : props.source === "category" ? "Choose a category slug with published posts to preview them here."
    : "Publish a blog post to preview it here.";

  const featured = props.variant === "featured-list" ? posts[0] : null;
  const remaining = featured ? posts.slice(1) : posts;
  const layout = props.variant === "list" ? "list" : "grid";
  return <section className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8" style={{ maxWidth: "var(--section-content-width, 80rem)" }} aria-label={typeof heading === "string" && heading && !isRichHeading(heading) ? heading : "Blog posts"}>
    {heading ? <div className="section-intro"><RichHeading level={2} customSize className="mb-7 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: "var(--font-heading)", fontWeight: 600, letterSpacing: "-0.025em" }}>{heading}</RichHeading></div> : null}
    {!posts.length ? <p role="status" className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted)]">{emptyMessage}</p> : null}
    {featured ? <div className={`grid gap-6 ${remaining.length ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" : "max-w-3xl"}`}>
      <BlogPostCard feed post={featured} blogPath={path} preview={preview} showExcerpt={props.showExcerpt} showDate={props.showDate}
        showAuthor={props.showAuthor} timezone={metadata?.siteBlogTimezone} />
      {remaining.length ? <div className="grid gap-6">{remaining.map((post) => <BlogPostCard feed key={post.id} post={post}
        blogPath={path} preview={preview} layout="list" showExcerpt={props.showExcerpt} showDate={props.showDate}
        showAuthor={props.showAuthor} timezone={metadata?.siteBlogTimezone} />)}</div> : null}
    </div> : null}
    {!featured && remaining.length ? <div className={props.variant === "carousel"
      ? "flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4"
      : layout === "list" ? "grid gap-8" : "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"}>
      {remaining.map((post) => <div key={post.id} className={props.variant === "carousel" ? "min-w-[min(85vw,24rem)] snap-start" : ""}>
        <BlogPostCard feed post={post} blogPath={path} preview={preview} layout={layout} showExcerpt={props.showExcerpt} showDate={props.showDate}
          showAuthor={props.showAuthor} timezone={metadata?.siteBlogTimezone} />
      </div>)}
    </div> : null}
    {posts.length > 0 && props.showViewAll ? <div className="mt-8 text-center"><a href={blogHref(path, "", preview)}
      className="inline-flex min-h-11 items-center rounded-lg border border-current px-5 font-medium hover:bg-[var(--color-soft-bg)]">View all posts</a></div> : null}
  </section>;
}

export const BlogPosts: ComponentConfig<BlogPostsProps> = {
  label: "Blog posts",
  fields: {
    design: designField(),
    heading: richHeadingField("Section heading", 2),
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
    heading: "Latest from the blog", source: "latest", category: "", count: 3, variant: "grid",
    showExcerpt: true, showDate: true, showAuthor: true, showViewAll: true,
  },
  render: renderBlogPosts,
};
