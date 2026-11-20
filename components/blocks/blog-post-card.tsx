import type { PublicBlogPost } from "@/lib/blog-public";
import { slugify } from "@/lib/page-slugs";
import { blogHref } from "@/lib/blog-navigation";
import { ArrowUpRight, BookOpen } from "lucide-react";

type Metadata = PublicBlogPost["publication"]["metadata"];
export type BlogCardPost = Pick<PublicBlogPost, "id" | "slug" | "published_at"> & {
  publication: { metadata: Pick<Metadata, "title" | "excerpt" | "thumbnail_image" | "cover_image" | "reading_minutes" | "category"> & {
    author: Pick<NonNullable<Metadata["author"]>, "name"> | null;
  } };
};

export function BlogPostCard({
  post, blogPath, layout = "grid", showExcerpt = true, showDate = true, showAuthor = true,
  showReadingTime = true, timezone = "UTC", feed = false, preview = false,
}: {
  post: BlogCardPost; blogPath: string; layout?: "grid" | "list";
  showExcerpt?: boolean; showDate?: boolean; showAuthor?: boolean; showReadingTime?: boolean; timezone?: string;
  feed?: boolean;
  preview?: boolean;
}) {
  const metadata = post.publication.metadata;
  const href = blogHref(blogPath, post.slug, preview);
  const date = showDate ? new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: timezone })
    .format(new Date(post.published_at)) : "";
  return (
    <article className={`group min-w-0 ${layout === "list" ? `grid sm:items-center ${feed ? "sm:grid-cols-[minmax(0,0.8fr)_1fr]" : "gap-5 sm:grid-cols-[minmax(12rem,0.8fr)_1fr]"}` : "flex flex-col"} ${feed ? "h-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] shadow-sm" : ""}`}>
      {metadata.thumbnail_image || metadata.cover_image ? (
        <a href={href} tabIndex={-1} aria-hidden="true" className={`block overflow-hidden bg-[var(--color-soft-bg)] ${feed ? "aspect-[16/10]" : layout === "list" ? "aspect-[4/3] rounded-xl" : "aspect-[16/10] rounded-xl"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={metadata.thumbnail_image || metadata.cover_image} alt="" loading="lazy" width="800" height="500"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        </a>
      ) : feed ? <div aria-hidden="true" className="grid aspect-[16/10] place-items-center bg-[var(--color-soft-bg)] text-[var(--color-primary)]">
        <BookOpen size={36} strokeWidth={1.25} />
      </div> : null}
      <div className={`flex min-w-0 flex-col items-start ${feed ? "flex-1 p-5" : ""}`}>
        {metadata.category ? <a href={blogHref(blogPath, `category/${metadata.category.slug}`, preview)}
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">{metadata.category.name}</a> : null}
        <h2 className="text-xl font-semibold leading-snug sm:text-2xl" style={{ fontFamily: "var(--font-heading)" }}>
          <a href={href} className="break-words hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
            {metadata.title}{feed ? <ArrowUpRight size={17} aria-hidden="true" className="ml-1 inline-block align-baseline text-[var(--color-primary)]" /> : null}
          </a>
        </h2>
        {showExcerpt && metadata.excerpt ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--color-muted)]">{metadata.excerpt}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
          {showAuthor && metadata.author ? <a href={`${blogPath.replace(/\/+$/, "")}/author/${encodeURIComponent(slugify(metadata.author.name))}`}
            className="hover:underline">{metadata.author.name}</a> : null}
          {date ? <time dateTime={post.published_at}>{date}</time> : null}
          {showReadingTime ? <span>{metadata.reading_minutes} min read</span> : null}
        </div>
      </div>
    </article>
  );
}
