import { RichTextContent } from "@/components/blocks/ui/rich-text";
import { BlogPostCard } from "@/components/blocks/blog-post-card";
import { BlogShareLinks } from "@/components/blocks/blog-share-links";
import { safeMediaUrl, videoEmbedUrl } from "@/lib/sections/design";
import { safeHref } from "@/lib/layout/guardrails";
import { slugify } from "@/lib/page-slugs";
import type { BlogBlock } from "@/lib/blog";
import type { BlogRoute, PublicBlogPost, PublicBlogSettings } from "@/lib/blog-public";

export type BlogArchiveProps = {
  blogPath: string;
  route: BlogRoute;
  settings: PublicBlogSettings;
  posts: PublicBlogPost[];
  allPosts: PublicBlogPost[];
  currentPost?: PublicBlogPost;
  previousPost?: PublicBlogPost;
  nextPost?: PublicBlogPost;
  relatedPosts?: PublicBlogPost[];
  total: number;
  pages: number;
  page: number;
  query: string;
  title: string;
  siteUrl: string;
  postUrl?: string;
};

function headingId(text: string, index: number) {
  return `${slugify(text) || "section"}-${index}`;
}

function pageHref(props: BlogArchiveProps, page: number) {
  const suffix = props.route.kind === "index" ? "" : `${props.route.kind}/${props.route.slug}`;
  const path = `${props.blogPath.replace(/\/+$/, "")}${suffix ? `/${suffix}` : ""}`;
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (props.query) params.set("q", props.query);
  return `${path}${params.size ? `?${params}` : ""}`;
}

function ArticleBlock({ block, id }: { block: BlogBlock; id?: string }) {
  switch (block.type) {
    case "paragraph":
      return <RichTextContent value={block.html} className="my-6 text-base leading-8 sm:text-lg" />;
    case "heading": {
      const className = "scroll-mt-24 mt-10 mb-4 font-semibold leading-tight";
      return block.level === 2 ? <h2 id={id} className={`${className} text-3xl`}>{block.text}</h2>
        : block.level === 3 ? <h3 id={id} className={`${className} text-2xl`}>{block.text}</h3>
          : <h4 id={id} className={`${className} text-xl`}>{block.text}</h4>;
    }
    case "list":
      return block.ordered ? <ol className="my-6 list-decimal space-y-2 pl-6">{block.items.map((item, index) => <li key={index}>{item}</li>)}</ol>
        : <ul className="my-6 list-disc space-y-2 pl-6">{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
    case "quote":
      return <blockquote className="my-8 border-l-4 border-[var(--color-primary)] bg-[var(--color-soft-bg)] px-6 py-5 text-xl leading-relaxed">
        <p>{block.text}</p>{block.attribution ? <cite className="mt-3 block text-sm not-italic text-[var(--color-muted)]">{block.attribution}</cite> : null}
      </blockquote>;
    case "callout":
      return <aside className="my-8 rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-soft-bg)] p-6">
        {block.title ? <h3 className="mb-2 text-lg font-semibold">{block.title}</h3> : null}<p className="leading-7">{block.text}</p>
      </aside>;
    case "image": {
      const url = safeMediaUrl(block.url);
      return url ? <figure className="my-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={block.alt} loading="lazy" width="1200" height="800" className="h-auto w-full rounded-xl object-cover" />
        {block.caption ? <figcaption className="mt-2 text-center text-sm text-[var(--color-muted)]">{block.caption}</figcaption> : null}
      </figure> : null;
    }
    case "gallery":
      return <div className="my-8 grid gap-4 sm:grid-cols-2">{block.images.map((image, index) => {
        const url = safeMediaUrl(image.url);
        return url ? <figure key={index}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={image.alt} loading="lazy" width="800" height="600" className="aspect-[4/3] w-full rounded-xl object-cover" />
          {image.caption ? <figcaption className="mt-2 text-sm text-[var(--color-muted)]">{image.caption}</figcaption> : null}
        </figure> : null;
      })}</div>;
    case "video": {
      const src = videoEmbedUrl(block.url);
      return src ? <div className="my-8 aspect-video overflow-hidden rounded-xl">
        <iframe src={src} title={block.title || "Embedded video"} loading="lazy" allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full border-0" />
      </div> : null;
    }
    case "button":
      return <p className="my-8"><a href={safeHref(block.href)}
        className="inline-flex min-h-12 items-center rounded-lg bg-[var(--color-primary)] px-6 py-3 font-semibold text-[var(--color-on-primary)] hover:opacity-90">{block.text}</a></p>;
    case "divider":
      return <hr className="my-10 border-0 border-t border-current/15" />;
    case "table":
      return <div className="my-8 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-current/15">
          {row.map((cell, cellIndex) => rowIndex === 0
            ? <th key={cellIndex} scope="col" className="px-3 py-3 font-semibold">{cell}</th>
            : <td key={cellIndex} className="px-3 py-3">{cell}</td>)}
        </tr>)}</tbody>
      </table></div>;
  }
}

function BlogPostView(props: BlogArchiveProps) {
  const post = props.currentPost;
  if (!post) return null;
  const metadata = post.publication.metadata;
  const layout = metadata.layout_override ?? props.settings.default_post_layout;
  const headings = post.publication.blocks.flatMap((block, index) =>
    block.type === "heading" ? [{ text: block.text, id: headingId(block.text, index) }] : []);
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: props.settings.timezone }).format(new Date(post.published_at));
  const cover = safeMediaUrl(metadata.cover_image);
  const body = <div className="min-w-0">
    <div className="mx-auto max-w-[70ch]">
      {metadata.cover_image ? <figure className="mb-8">
        {cover ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt={metadata.cover_alt} width="1400" height="900" fetchPriority="high"
            className="aspect-[14/9] w-full rounded-2xl bg-[var(--color-soft-bg)] object-cover" />
        </> : null}
      </figure> : null}
      {metadata.author ? <div className="mb-6 flex items-center gap-3">
        {metadata.author.photo && safeMediaUrl(metadata.author.photo) ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={safeMediaUrl(metadata.author.photo)!} alt="" width="48" height="48" className="h-12 w-12 rounded-full object-cover" />
        </> : null}
        <div><a href={`${props.blogPath.replace(/\/+$/, "")}/author/${encodeURIComponent(slugify(metadata.author.name))}`}
          className="font-medium hover:underline">{metadata.author.name}</a>
          {metadata.author.bio ? <p className="mt-1 max-w-prose text-sm text-[var(--color-muted)]">{metadata.author.bio}</p> : null}
          {props.settings.show_date ? <p className="text-sm text-[var(--color-muted)]"><time dateTime={post.published_at}>{date}</time></p> : null}
        </div>
      </div> : props.settings.show_date ? <p className="mb-6 text-sm text-[var(--color-muted)]"><time dateTime={post.published_at}>{date}</time></p> : null}
      {props.settings.show_reading_time ? <p className="mb-6 text-sm text-[var(--color-muted)]">{metadata.reading_minutes} min read</p> : null}
      {props.settings.show_share_links && props.postUrl ? <div className="mb-8"><BlogShareLinks url={props.postUrl} title={metadata.title} /></div> : null}
      {headings.length > 1 ? <nav className="mb-8 rounded-xl bg-[var(--color-soft-bg)] p-5" aria-label="Table of contents">
        <h2 className="mb-3 text-sm font-semibold">On this page</h2><ol className="list-inside list-decimal space-y-2 text-sm">
          {headings.map((heading) => <li key={heading.id}><a href={`#${heading.id}`} className="hover:underline">{heading.text}</a></li>)}
        </ol>
      </nav> : null}
      <div className="blog-article-content">
        {post.publication.blocks.map((block, index) => <ArticleBlock key={index} block={block}
          id={block.type === "heading" ? headingId(block.text, index) : undefined} />)}
      </div>
    </div>
    {props.settings.cta_text && safeHref(props.settings.cta_link) !== "#" ? <aside className="mx-auto mt-12 max-w-[70ch] rounded-2xl bg-[var(--color-soft-bg)] p-6 sm:p-8">
      <p className="text-lg font-medium">{props.settings.cta_text}</p>
      {props.settings.cta_button_text ? <a href={safeHref(props.settings.cta_link)}
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-on-primary)]">{props.settings.cta_button_text}</a> : null}
    </aside> : null}
    {(props.previousPost || props.nextPost) ? <nav className="mx-auto mt-10 grid max-w-[70ch] gap-4 border-t border-current/15 pt-6 sm:grid-cols-2" aria-label="More posts">
      {props.previousPost ? <a href={`${props.blogPath.replace(/\/+$/, "")}/${props.previousPost.slug.split("/").map(encodeURIComponent).join("/")}`} className="hover:underline">
        <span className="block text-xs text-[var(--color-muted)]">Previous</span>{props.previousPost.publication.metadata.title}</a> : <span />}
      {props.nextPost ? <a href={`${props.blogPath.replace(/\/+$/, "")}/${props.nextPost.slug.split("/").map(encodeURIComponent).join("/")}`} className="text-right hover:underline">
        <span className="block text-xs text-[var(--color-muted)]">Next</span>{props.nextPost.publication.metadata.title}</a> : null}
    </nav> : null}
    {props.relatedPosts?.length ? <section className="mx-auto mt-14 max-w-7xl border-t border-current/15 px-5 pt-10 sm:px-8" aria-labelledby="related-posts">
      <h2 id="related-posts" className="mb-6 text-2xl font-semibold">Related posts</h2>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">{props.relatedPosts.map((related) =>
        <BlogPostCard key={related.id} post={related} blogPath={props.blogPath} timezone={props.settings.timezone} />)}</div>
    </section> : null}
  </div>;

  const title = <header className="mx-auto max-w-4xl px-5 pb-8 pt-12 text-center sm:px-8">
    {metadata.category ? <a href={`${props.blogPath.replace(/\/+$/, "")}/category/${encodeURIComponent(metadata.category.slug)}`}
      className="text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">{metadata.category.name}</a> : null}
    <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl" style={{ fontFamily: "var(--font-heading)" }}>{metadata.title}</h1>
    {metadata.subtitle ? <p className="mx-auto mt-4 max-w-3xl text-lg leading-7 text-[var(--color-muted)]">{metadata.subtitle}</p> : null}
    <nav className="mt-5 text-sm text-[var(--color-muted)]" aria-label="Breadcrumb">
      <a href={props.blogPath} className="hover:underline">Blog</a><span aria-hidden="true"> / </span><span>{metadata.title}</span>
    </nav>
  </header>;

  return <article className={layout === "wide" ? "w-full" : "w-full"}>
    {title}
    <div className={layout === "wide" ? "mx-auto grid max-w-7xl gap-10 px-5 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_18rem]" : "px-5 pb-16 sm:px-8"}>
      {body}
      {layout === "wide" ? <aside className="hidden lg:block">
        {headings.length > 1 ? <nav className="sticky top-8 rounded-xl bg-[var(--color-soft-bg)] p-5" aria-label="Table of contents">
          <h2 className="mb-3 text-sm font-semibold">On this page</h2><ol className="space-y-2 text-sm">
            {headings.map((heading) => <li key={heading.id}><a href={`#${heading.id}`} className="hover:underline">{heading.text}</a></li>)}
          </ol>
        </nav> : null}
      </aside> : null}
    </div>
  </article>;
}

export function BlogArchive(props: BlogArchiveProps) {
  if (props.route.kind === "post") return <BlogPostView {...props} />;
  const categories = [...new Map(props.allPosts.flatMap(({ publication }) => publication.metadata.category
    ? [[publication.metadata.category.slug, publication.metadata.category] as const] : [])).values()];
  const displayPosts = props.settings.index_layout === "magazine" && props.page === 1 && !props.query
    ? props.posts : props.posts;
  return <section className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8" aria-labelledby="blog-heading">
    <header className="mb-8">
      <h1 id="blog-heading" className="text-4xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>{props.title}</h1>
      {props.route.kind === "index" ? <form action={props.blogPath} method="get" role="search" className="mt-5 flex max-w-xl gap-2">
        <label className="sr-only" htmlFor="blog-search">Search blog posts</label>
        <input id="blog-search" type="search" name="q" defaultValue={props.query} placeholder="Search posts"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-current/20 bg-transparent px-3" />
        <button className="min-h-11 rounded-lg bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-on-primary)]">Search</button>
      </form> : null}
      {categories.length ? <nav className="mt-5 flex flex-wrap gap-2" aria-label="Blog categories">
        <a href={props.blogPath} className={`rounded-full border px-3 py-1.5 text-sm ${props.route.kind === "index" ? "border-[var(--color-primary)]" : "border-current/20"}`}>All</a>
        {categories.map((category) => <a key={category.slug} href={`${props.blogPath.replace(/\/+$/, "")}/category/${encodeURIComponent(category.slug)}`}
          className="rounded-full border border-current/20 px-3 py-1.5 text-sm hover:border-[var(--color-primary)]">{category.name}</a>)}
      </nav> : null}
    </header>
    {!displayPosts.length ? <p className="py-16 text-center text-[var(--color-muted)]">No posts found.</p> :
      props.settings.index_layout === "magazine" && props.page === 1 && !props.query && displayPosts.length > 1 ? <>
        <div className="mb-10 rounded-2xl bg-[var(--color-soft-bg)] p-5 sm:p-8">
          <BlogPostCard post={displayPosts[0]} blogPath={props.blogPath} showExcerpt showDate={props.settings.show_date}
            showAuthor={props.settings.show_author} showReadingTime={props.settings.show_reading_time} timezone={props.settings.timezone} />
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">{displayPosts.slice(1).map((post) =>
          <BlogPostCard key={post.id} post={post} blogPath={props.blogPath} showDate={props.settings.show_date}
            showAuthor={props.settings.show_author} showReadingTime={props.settings.show_reading_time} timezone={props.settings.timezone} />)}</div>
      </> : <div className={props.settings.index_layout === "list" ? "grid gap-8" : "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"}>
        {displayPosts.map((post) => <BlogPostCard key={post.id} post={post} blogPath={props.blogPath}
          layout={props.settings.index_layout === "list" ? "list" : "grid"} showDate={props.settings.show_date}
          showAuthor={props.settings.show_author} showReadingTime={props.settings.show_reading_time} timezone={props.settings.timezone} />)}
      </div>}
    {props.pages > 1 ? <nav className="mt-10 flex items-center justify-center gap-4" aria-label="Blog pagination">
      {props.page > 1 ? <a className="inline-flex min-h-11 items-center rounded-lg border border-current/20 px-4 hover:bg-[var(--color-soft-bg)]" href={pageHref(props, props.page - 1)}>Previous</a> : null}
      <span className="text-sm text-[var(--color-muted)]">Page {props.page} of {props.pages}</span>
      {props.page < props.pages ? <a className="inline-flex min-h-11 items-center rounded-lg border border-current/20 px-4 hover:bg-[var(--color-soft-bg)]" href={pageHref(props, props.page + 1)}>Next</a> : null}
    </nav> : null}
  </section>;
}
