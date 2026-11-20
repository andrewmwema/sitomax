import type { PublicBlogPost } from "@/lib/blog-public";
import { slugify } from "@/lib/page-slugs";

export function BlogPostCard({
  post, blogPath, layout = "grid", showExcerpt = true, showDate = true, showAuthor = true,
  showReadingTime = true, timezone = "UTC",
}: {
  post: PublicBlogPost; blogPath: string; layout?: "grid" | "list";
  showExcerpt?: boolean; showDate?: boolean; showAuthor?: boolean; showReadingTime?: boolean; timezone?: string;
}) {
  const metadata = post.publication.metadata;
  const href = `${blogPath.replace(/\/+$/, "")}/${post.slug.split("/").map(encodeURIComponent).join("/")}`;
  const date = showDate ? new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: timezone })
    .format(new Date(post.published_at)) : "";
  return (
    <article className={`group min-w-0 ${layout === "list" ? "grid gap-5 sm:grid-cols-[minmax(12rem,0.8fr)_1fr] sm:items-center" : "flex flex-col"}`}>
      {metadata.thumbnail_image || metadata.cover_image ? (
        <a href={href} tabIndex={-1} aria-hidden="true" className={`block overflow-hidden rounded-xl bg-[var(--color-soft-bg)] ${layout === "list" ? "aspect-[4/3]" : "aspect-[16/10]"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={metadata.thumbnail_image || metadata.cover_image} alt="" loading="lazy" width="800" height="500"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        </a>
      ) : null}
      <div className="flex flex-col items-start">
        {metadata.category ? <a href={`${blogPath.replace(/\/+$/, "")}/category/${encodeURIComponent(metadata.category.slug)}`}
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">{metadata.category.name}</a> : null}
        <h2 className="text-xl font-semibold leading-snug sm:text-2xl" style={{ fontFamily: "var(--font-heading)" }}>
          <a href={href} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">{metadata.title}</a>
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
