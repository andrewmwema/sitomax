"use client";

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronDown, ImagePlus, Plus, Search, X } from "lucide-react";
import { EditorSiteContext } from "@/components/editor/image-upload-field";
import { MediaPicker } from "@/components/editor/media-picker";
import { BlogImportPanel } from "@/components/dashboard/blog-import-panel";
import { blogManagerHref } from "@/lib/blog-navigation";
import {
  bulkBlogPostStatus, createBlogPost, deleteBlogAuthor, deleteBlogCategory, deleteBlogPost, duplicateBlogPost,
  saveBlogAuthor, saveBlogCategory, saveBlogImageAltText, saveBlogSettings, setBlogPostStatus,
} from "@/app/(dashboard)/dashboard/sites/[siteId]/blog/actions";

export type BlogManagerPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  cover_image: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  publish_at: string | null;
  status: "draft" | "scheduled" | "published";
  has_unpublished_changes: boolean;
  author_id: string | null;
  author_name: string;
  category_id: string | null;
  category_name: string;
  tag_names: string[];
};
export type BlogManagerCategory = { id: string; name: string; slug: string; description: string };
export type BlogManagerAuthor = { id: string; name: string; bio: string; photo: string };
export type BlogManagerTag = { id: string; name: string };
export type BlogAltEntry = {
  postId: string; postTitle: string; imageUrl: string; alt: string;
  location: "cover" | "thumbnail" | "block" | "gallery"; blockIndex?: number; imageIndex?: number;
};

type Props = {
  siteId: string;
  editorPageId: string | null;
  subdomain: string;
  siteName: string;
  timezone: string;
  posts: BlogManagerPost[];
  categories: BlogManagerCategory[];
  authors: BlogManagerAuthor[];
  tags: BlogManagerTag[];
  altEntries: BlogAltEntry[];
  settings: BlogSettings;
};

const control = "w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-[#4B3FE0]";
const tabs = ["Posts", "Categories", "Authors", "All alt text", "Settings", "Import"] as const;
type Tab = (typeof tabs)[number];

export function BlogManager(props: Props) {
  const [tab, setTab] = useState<Tab>("Posts");
  return <EditorSiteContext.Provider value={{ siteId: props.siteId }}>
    <main className="platform-ui mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500"><Link href={`/dashboard/sites/${props.siteId}`} className="hover:underline">Site</Link> / Blog</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Blog</h1>
          <p className="mt-1 text-sm text-zinc-500">{props.siteName} · {props.timezone}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.editorPageId ? <Link href={`/editor/${props.editorPageId}`} className="platform-button"><ArrowLeft size={15} />Back to editor</Link> : null}
          <Link href={`/dashboard/sites/${props.siteId}`} className="platform-button">Site overview</Link>
          {tab === "Posts" ? <CreatePostDialog siteId={props.siteId} editorPageId={props.editorPageId} authors={props.authors} /> : null}
        </div>
      </header>
      <nav aria-label="Blog management" className="mt-7 flex flex-wrap gap-5 border-b border-[#E8E7E3]">
        {tabs.map((name) => <button key={name} type="button" onClick={() => setTab(name)}
          aria-current={tab === name ? "page" : undefined}
          className={`border-b-2 px-1 pb-3 text-sm ${tab === name ? "border-[#4B3FE0] font-semibold text-[#3025B8]" : "border-transparent text-zinc-600 hover:text-zinc-900"}`}>
          {name}
        </button>)}
      </nav>
      <section className="pt-6">
        {tab === "Posts" ? <PostsView {...props} /> : null}
        {tab === "Categories" ? <CategoriesView siteId={props.siteId} categories={props.categories} /> : null}
        {tab === "Authors" ? <AuthorsView siteId={props.siteId} authors={props.authors} /> : null}
        {tab === "All alt text" ? <AltTextView siteId={props.siteId} editorPageId={props.editorPageId} entries={props.altEntries} /> : null}
        {tab === "Settings" ? <SettingsView {...props} /> : null}
        {tab === "Import" ? <BlogImportPanel siteId={props.siteId} /> : null}
      </section>
    </main>
  </EditorSiteContext.Provider>;
}

function CreatePostDialog({ siteId, editorPageId, authors }: Pick<Props, "siteId" | "editorPageId" | "authors">) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [image, setImage] = useState({ url: "", alt: "" });
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = () => { setError(""); setTitle(""); setImage({ url: "", alt: "" }); ref.current?.showModal(); };
  const close = () => { if (!busy) ref.current?.close(); };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await createBlogPost(siteId, {
        title, authorId: authorId || null, coverImage: image.url, coverAlt: image.alt,
      });
      if (result.status === "error") { setError(result.message); return; }
      ref.current?.close();
      router.push(blogManagerHref(siteId, editorPageId, result.postId));
    } catch {
      setError("Could not create the post. Please retry.");
    } finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={open} className="platform-button platform-button-primary"><Plus size={14} />New post</button>
    <dialog ref={ref} aria-labelledby="create-post-title" onCancel={(event) => { event.preventDefault(); close(); }}
      className="platform-ui m-auto w-[min(520px,94vw)] rounded-2xl border border-[#E8E7E3] bg-white p-0 shadow-2xl backdrop:bg-zinc-950/30">
      <form onSubmit={submit} className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div><p className="platform-eyebrow">New article</p><h2 id="create-post-title" className="mt-1 text-lg font-semibold">Start a post</h2></div>
          <button type="button" onClick={close} aria-label="Close dialog" className="rounded-lg p-2 hover:bg-zinc-100"><X size={17} /></button>
        </div>
        <label className="mt-5 block text-sm font-medium">Title
          <input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className={`${control} mt-1`} />
          <span className="mt-1 block text-right text-xs text-zinc-500">{title.length}/200</span>
        </label>
        <label className="mt-3 block text-sm font-medium">Author
          <select value={authorId} onChange={(event) => setAuthorId(event.target.value)} className={`${control} mt-1`}>
            <option value="">Me</option>
            {authors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
          </select>
        </label>
        <div className="mt-4">
          <p className="text-sm font-medium">Main image <span className="font-normal text-zinc-500">(optional)</span></p>
          {image.url ? <div className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt="" className="size-16 rounded-lg object-cover" />
            <div className="min-w-0 flex-1"><p className="truncate text-xs text-zinc-600">{image.alt || "Alt text not set"}</p>
              <button type="button" className="mt-1 text-xs text-red-700 underline" onClick={() => setImage({ url: "", alt: "" })}>Remove image</button></div>
          </div> : null}
          <button type="button" onClick={() => setPicker(true)} className="platform-button mt-2"><ImagePlus size={14} />{image.url ? "Replace image" : "Choose image"}</button>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={close} className="platform-button">Cancel</button>
          <button type="submit" disabled={busy || !title.trim()} className="platform-button platform-button-primary">{busy ? "Starting…" : "Start writing"}</button>
        </div>
      </form>
    </dialog>
    {picker ? <MediaPicker scope={{ siteId }} value={image.url} onClose={() => setPicker(false)}
      onSelect={(next) => setImage({ url: next.url, alt: next.alt })} /> : null}
  </>;
}

function PostsView({ siteId, editorPageId, subdomain, settings, posts, categories, authors, tags, timezone }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [author, setAuthor] = useState("all");
  const [sort, setSort] = useState("updated");
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => posts.filter((post) => {
    const text = `${post.title} ${post.excerpt} ${post.author_name} ${post.tag_names.join(" ")}`.toLowerCase();
    return (!query.trim() || text.includes(query.trim().toLowerCase())) &&
      (status === "all" || post.status === status) &&
      (category === "all" || post.category_id === category) &&
      (author === "all" || post.author_id === author);
  }).sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "created") return b.created_at.localeCompare(a.created_at);
    if (sort === "published") return (b.published_at ?? "").localeCompare(a.published_at ?? "");
    return b.updated_at.localeCompare(a.updated_at);
  }), [posts, query, status, category, author, sort]);
  const allVisible = filtered.length > 0 && filtered.every(({ id }) => selected.includes(id));
  async function bulk(action: "draft" | "published" | "delete") {
    if (action === "delete" && !window.confirm(`Delete ${selected.length} selected posts? This cannot be undone.`)) return;
    setWorking(true); setMessage("");
    try {
      const result = await bulkBlogPostStatus(siteId, selected, action);
      setMessage(result.message);
      if (result.status === "success") { setSelected([]); router.refresh(); }
    } catch { setMessage("Could not update selected posts."); }
    finally { setWorking(false); }
  }
  const date = (value: string | null) => value
    ? new Date(value).toLocaleDateString(undefined, { timeZone: timezone })
    : "—";
  return <>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-56 flex-1 text-xs text-zinc-600">Search posts
        <span className="mt-1 flex items-center gap-2 rounded-lg border border-[#E8E7E3] bg-white px-3"><Search size={15} className="text-zinc-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, excerpt, tag or author" className="h-10 min-w-0 flex-1 text-sm outline-none" />
        </span>
      </label>
      <Filter label="Status" value={status} setValue={setStatus} options={[["all", "All statuses"], ["draft", "Draft"], ["scheduled", "Scheduled"], ["published", "Published"]]} />
      <Filter label="Category" value={category} setValue={setCategory} options={[["all", "All categories"], ...categories.map(({ id, name }) => [id, name] as [string, string])]} />
      <Filter label="Author" value={author} setValue={setAuthor} options={[["all", "All authors"], ...authors.map(({ id, name }) => [id, name] as [string, string])]} />
      <Filter label="Sort" value={sort} setValue={setSort} options={[["updated", "Updated"], ["created", "Created"], ["published", "Published"], ["title", "Title"]]} />
    </div>
    {selected.length ? <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#D9D5FF] bg-[#F8F7FF] p-3 text-sm">
      <span className="mr-auto">{selected.length} selected</span>
      <button disabled={working} className="platform-button" onClick={() => void bulk("published")}>Publish</button>
      <button disabled={working} className="platform-button" onClick={() => void bulk("draft")}>Unpublish</button>
      <button disabled={working} className="platform-button text-red-700" onClick={() => void bulk("delete")}>Delete</button>
    </div> : null}
    <div className="mt-4 overflow-x-auto rounded-xl border border-[#E8E7E3] bg-white">
      <table className="w-full min-w-[880px] border-collapse text-left text-sm">
        <thead className="bg-[#F8F8F6] text-xs text-zinc-500"><tr>
          <th className="w-10 p-3"><input type="checkbox" aria-label="Select visible posts" checked={allVisible}
            onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...filtered.map(({ id }) => id)])] : selected.filter((id) => !filtered.some((post) => post.id === id)))} /></th>
          <th className="p-3 font-medium">Post</th><th className="p-3 font-medium">Author</th><th className="p-3 font-medium">Status</th>
          <th className="p-3 font-medium">Created</th><th className="p-3 font-medium">Published</th><th className="p-3 font-medium">Actions</th>
        </tr></thead>
        <tbody className="divide-y divide-[#EEEDE9]">
          {filtered.map((post) => <tr key={post.id} className="group hover:bg-[#FCFCFB]">
            <td className="p-3"><input type="checkbox" aria-label={`Select ${post.title}`} checked={selected.includes(post.id)}
              onChange={(event) => setSelected(event.target.checked ? [...selected, post.id] : selected.filter((id) => id !== post.id))} /></td>
            <td className="p-3">
              <div className="flex items-center gap-3">
                {post.cover_image ? <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.cover_image} alt="" className="size-12 rounded-lg object-cover" />
                </> : <span aria-hidden className="flex size-12 items-center justify-center rounded-lg bg-[#F4F3EF] text-zinc-400"><BookOpen size={17} /></span>}
                <div className="min-w-0"><Link href={blogManagerHref(siteId, editorPageId, post.id)} className="block truncate font-medium hover:underline">{post.title}</Link>
                  <p className="mt-0.5 max-w-[380px] truncate text-xs text-zinc-500">{post.excerpt || `/${post.slug}`}</p></div>
              </div>
            </td>
            <td className="p-3 text-zinc-700">{post.author_name || "—"}</td>
            <td className="p-3"><StatusBadge post={post} /></td>
            <td className="p-3 text-xs text-zinc-600">{date(post.created_at)}</td>
            <td className="p-3 text-xs text-zinc-600">{date(post.published_at)}</td>
            <td className="p-3"><div className="flex items-center gap-2">
              <Link href={blogManagerHref(siteId, editorPageId, post.id)} className="text-xs text-[#4B3FE0] opacity-0 underline transition group-hover:opacity-100 focus:opacity-100">Edit</Link>
              <Link href={blogManagerHref(siteId, editorPageId, post.id, "settings")} className="text-xs text-[#4B3FE0] opacity-0 underline transition group-hover:opacity-100 focus:opacity-100">Settings</Link>
              {post.status !== "published" || post.has_unpublished_changes
                ? <QuickPublishButton post={post} onMessage={setMessage} />
                : null}
              <PostMenu post={post} siteId={siteId} editorPageId={editorPageId} subdomain={subdomain} blogPath={settings.blog_path} onMessage={setMessage} />
            </div></td>
          </tr>)}
          {!filtered.length ? <tr><td colSpan={7} className="p-10 text-center text-sm text-zinc-500">{posts.length ? "No posts match these filters." : "No posts yet. Start with a title and a blank canvas."}</td></tr> : null}
        </tbody>
      </table>
    </div>
    <p role="status" aria-live="polite" className="mt-3 text-sm text-zinc-600">{message}</p>
    <div className="sr-only">{tags.map(({ id, name }) => <span key={id}>{name}</span>)}</div>
  </>;
}

function Filter({ label, value, setValue, options }: {
  label: string; value: string; setValue: (value: string) => void; options: [string, string][];
}) {
  return <label className="text-xs text-zinc-600">{label}
    <select value={value} onChange={(event) => setValue(event.target.value)} className={`${control} mt-1 min-w-32`}>
      {options.map(([option, name]) => <option key={option} value={option}>{name}</option>)}
    </select>
  </label>;
}

function StatusBadge({ post }: { post: BlogManagerPost }) {
  const label = post.status === "scheduled" ? "Scheduled" : post.status === "published"
    ? post.has_unpublished_changes ? "Changes not published" : "Published" : "Draft";
  const style = post.status === "published" ? "bg-emerald-50 text-emerald-800" :
    post.status === "scheduled" ? "bg-amber-50 text-amber-800" : "bg-zinc-100 text-zinc-700";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${style}`}>{label}</span>;
}

function QuickPublishButton({ post, onMessage }: { post: BlogManagerPost; onMessage: (message: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function publish() {
    setBusy(true);
    try {
      const result = await setBlogPostStatus(post.id, "published");
      onMessage(result.message);
      if (result.status === "success") router.refresh();
    } catch { onMessage("Could not publish this post. Please retry."); }
    finally { setBusy(false); }
  }
  return <button type="button" disabled={busy} onClick={() => void publish()}
    className="text-xs text-[#4B3FE0] opacity-0 underline transition group-hover:opacity-100 focus:opacity-100">
    {post.status === "published" ? "Republish" : "Publish"}
  </button>;
}

function PostMenu({ post, siteId, editorPageId, subdomain, blogPath, onMessage }: Pick<Props, "siteId" | "editorPageId" | "subdomain"> & {
  post: BlogManagerPost; blogPath: string; onMessage: (message: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<{ status: "success" | "error"; message: string; postId?: string }>) {
    setBusy(true);
    try {
      const result = await action();
      onMessage(result.message);
      if (result.status === "success") router.refresh();
      if (result.status === "success" && result.postId) router.push(blogManagerHref(siteId, editorPageId, result.postId));
    } catch { onMessage("The action failed. Please retry."); }
    finally { setBusy(false); }
  }
  return <details className="relative">
    <summary className="cursor-pointer list-none rounded-lg border border-transparent px-3 py-1.5 text-xs hover:border-zinc-200 hover:bg-zinc-50">More <ChevronDown size={12} className="inline" /></summary>
    <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-[#E8E7E3] bg-white p-1.5 shadow-lg">
      <Link href={blogManagerHref(siteId, editorPageId, post.id)} className="block rounded-lg px-3 py-2 text-xs hover:bg-zinc-50">Edit</Link>
      <Link href={blogManagerHref(siteId, editorPageId, post.id, "settings")} className="block rounded-lg px-3 py-2 text-xs hover:bg-zinc-50">Settings</Link>
      {post.status === "published" ? <a href={`/s/${encodeURIComponent(subdomain)}${blogPath.replace(/\/+$/, "")}/${post.slug.split("/").map(encodeURIComponent).join("/")}`}
        target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2 text-xs hover:bg-zinc-50">View live</a> : null}
      {post.status === "published" && post.has_unpublished_changes ? <button type="button" disabled={busy}
        onClick={() => void run(() => setBlogPostStatus(post.id, "published"))}
        className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-zinc-50">Republish</button> : null}
      {post.status !== "published" ? <button type="button" disabled={busy}
        onClick={() => void run(() => setBlogPostStatus(post.id, "published"))}
        className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-zinc-50">Publish</button> : null}
      {post.status !== "draft" ? <button type="button" disabled={busy}
        onClick={() => void run(() => setBlogPostStatus(post.id, "draft"))}
        className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-zinc-50">Unpublish</button> : null}
      <button type="button" disabled={busy} onClick={() => void run(() => duplicateBlogPost(post.id))}
        className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-zinc-50">Duplicate</button>
      <button type="button" disabled={busy} onClick={() => {
        if (window.confirm(`Delete “${post.title}”? This cannot be undone.`)) void run(() => deleteBlogPost(post.id));
      }} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50">Delete…</button>
    </div>
  </details>;
}

function CategoriesView({ siteId, categories }: { siteId: string; categories: BlogManagerCategory[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BlogManagerCategory | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [message, setMessage] = useState("");
  const open = (category?: BlogManagerCategory) => {
    setEditing(category ?? null); setName(category?.name ?? ""); setSlug(category?.slug ?? "");
    setDescription(category?.description ?? ""); setMessage("");
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await saveBlogCategory(siteId, editing?.id ?? null, { name, slug, description });
    setMessage(result.message);
    if (result.status === "success") { setEditing(null); router.refresh(); }
  }
  async function remove(categoryId: string) {
    const destination = moveTo ? categories.find(({ id }) => id === moveTo)?.name ?? "the selected category" : "no category";
    if (!window.confirm(`Delete this category and move its posts to ${destination}?`)) return;
    const result = await deleteBlogCategory(siteId, categoryId, moveTo || null);
    setMessage(result.message);
    if (result.status === "success") router.refresh();
  }
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div className="overflow-hidden rounded-xl border border-[#E8E7E3] bg-white">
      {categories.map((category) => <div key={category.id} className="flex flex-wrap items-center gap-3 border-b border-[#EEEDE9] p-4 last:border-0">
        <div className="min-w-0 flex-1"><p className="font-medium">{category.name}</p><p className="text-xs text-zinc-500">/{category.slug}</p>
          {category.description ? <p className="mt-1 text-xs text-zinc-600">{category.description}</p> : null}</div>
        <button type="button" onClick={() => open(category)} className="platform-button">Edit</button>
        <label className="sr-only" htmlFor={`move-${category.id}`}>Move posts to</label>
        <select id={`move-${category.id}`} value={moveTo} onChange={(event) => setMoveTo(event.target.value)} className="max-w-40 rounded-lg border px-2 py-2 text-xs">
          <option value="">No category</option>{categories.filter(({ id }) => id !== category.id).map((next) => <option key={next.id} value={next.id}>{next.name}</option>)}
        </select>
        <button type="button" onClick={() => void remove(category.id)} className="platform-button text-red-700">Delete</button>
      </div>)}
      {!categories.length ? <p className="p-8 text-center text-sm text-zinc-500">No categories yet.</p> : null}
    </div>
    <form onSubmit={save} className="h-fit rounded-xl border border-[#E8E7E3] bg-white p-5">
      <h2 className="font-semibold">{editing ? "Edit category" : "New category"}</h2>
      <label className="mt-4 block text-xs">Name<input required maxLength={100} value={name} onChange={(event) => {
        setName(event.target.value); if (!editing) setSlug(event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
      }} className={`${control} mt-1`} /></label>
      <label className="mt-3 block text-xs">Slug<input required maxLength={200} value={slug} onChange={(event) => setSlug(event.target.value)} className={`${control} mt-1`} /></label>
      <label className="mt-3 block text-xs">Description<textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} className={`${control} mt-1`} /></label>
      <p role="status" className="mt-2 text-xs text-zinc-600">{message}</p>
      <div className="mt-4 flex gap-2"><button type="submit" className="platform-button platform-button-primary">{editing ? "Save category" : "Create category"}</button>
        {editing ? <button type="button" onClick={() => open()} className="platform-button">Cancel</button> : null}</div>
    </form>
  </div>;
}

function AuthorsView({ siteId, authors }: { siteId: string; authors: BlogManagerAuthor[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BlogManagerAuthor | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [photo, setPhoto] = useState("");
  const [message, setMessage] = useState("");
  function open(author?: BlogManagerAuthor) {
    setEditing(author ?? null); setName(author?.name ?? ""); setBio(author?.bio ?? ""); setPhoto(author?.photo ?? ""); setMessage("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await saveBlogAuthor(siteId, editing?.id ?? null, { name, bio, photo });
    setMessage(result.message);
    if (result.status === "success") { setEditing(null); router.refresh(); }
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this author profile? Their posts will remain without an author.")) return;
    const result = await deleteBlogAuthor(siteId, id);
    setMessage(result.message);
    if (result.status === "success") router.refresh();
  }
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div className="overflow-hidden rounded-xl border border-[#E8E7E3] bg-white">
      {authors.map((author) => <div key={author.id} className="flex items-center gap-3 border-b border-[#EEEDE9] p-4 last:border-0">
        {author.photo ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={author.photo} alt="" className="size-11 rounded-full object-cover" />
        </> : <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-[#F1EFFF] font-semibold text-[#4B3FE0]">{author.name.slice(0, 1).toUpperCase()}</span>}
        <div className="min-w-0 flex-1"><p className="font-medium">{author.name}</p><p className="truncate text-xs text-zinc-500">{author.bio || "No bio yet"}</p></div>
        <button type="button" onClick={() => open(author)} className="platform-button">Edit</button>
        <button type="button" onClick={() => void remove(author.id)} className="platform-button text-red-700">Delete</button>
      </div>)}
      {!authors.length ? <p className="p-8 text-center text-sm text-zinc-500">Author profiles are created when a writer starts their first post.</p> : null}
    </div>
    <form onSubmit={save} className="h-fit rounded-xl border border-[#E8E7E3] bg-white p-5">
      <h2 className="font-semibold">{editing ? "Edit author" : "New author"}</h2>
      <label className="mt-4 block text-xs">Name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={`${control} mt-1`} /></label>
      <label className="mt-3 block text-xs">Bio<textarea maxLength={2000} value={bio} onChange={(event) => setBio(event.target.value)} rows={4} className={`${control} mt-1`} /></label>
      <label className="mt-3 block text-xs">Photo URL<input maxLength={2048} value={photo} onChange={(event) => setPhoto(event.target.value)} className={`${control} mt-1`} /></label>
      <p role="status" className="mt-2 text-xs text-zinc-600">{message}</p>
      <div className="mt-4 flex gap-2"><button type="submit" className="platform-button platform-button-primary">{editing ? "Save author" : "Create author"}</button>
        {editing ? <button type="button" onClick={() => open()} className="platform-button">Cancel</button> : null}</div>
    </form>
  </div>;
}

function AltTextView({ siteId, editorPageId, entries }: Pick<Props, "siteId" | "editorPageId"> & { entries: BlogAltEntry[] }) {
  return <div>
    <h2 className="text-lg font-semibold">Images that need alt text</h2>
    <p className="mt-1 text-sm text-zinc-500">Add a concise description to images with missing or generic alt text.</p>
    <div className="mt-5 grid gap-3">
      {entries.map((entry) => <AltTextRow key={`${entry.postId}-${entry.location}-${entry.blockIndex ?? ""}-${entry.imageIndex ?? ""}`}
        siteId={siteId} editorPageId={editorPageId} entry={entry} />)}
      {!entries.length ? <p className="rounded-xl border border-[#E8E7E3] bg-white p-8 text-center text-sm text-zinc-500">Every post image has descriptive alt text.</p> : null}
    </div>
  </div>;
}

function AltTextRow({ siteId, editorPageId, entry }: Pick<Props, "siteId" | "editorPageId"> & { entry: BlogAltEntry }) {
  const router = useRouter();
  const [alt, setAlt] = useState(entry.alt);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const input = entry.location === "cover" || entry.location === "thumbnail"
        ? { location: entry.location, alt }
        : entry.location === "block"
          ? { location: entry.location, blockIndex: entry.blockIndex, alt }
          : { location: entry.location, blockIndex: entry.blockIndex, imageIndex: entry.imageIndex, alt };
      const result = await saveBlogImageAltText(siteId, entry.postId, {
        ...input,
      });
      setMessage(result.message);
      if (result.status === "success") router.refresh();
    } catch { setMessage("Could not save this image description."); }
    finally { setBusy(false); }
  }
  return <article className="flex flex-wrap items-center gap-4 rounded-xl border border-[#E8E7E3] bg-white p-4">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={entry.imageUrl} alt="" className="size-16 rounded-lg object-cover" />
    <div className="min-w-40 flex-1">
      <Link href={blogManagerHref(siteId, editorPageId, entry.postId)} className="text-sm font-medium hover:underline">{entry.postTitle}</Link>
      <p className="mt-1 text-xs capitalize text-zinc-500">{entry.location === "cover" ? "Main image" : entry.location === "thumbnail" ? "Social image" : `${entry.location} in post`}</p>
    </div>
    <label className="min-w-52 flex-[2] text-xs">Alt text
      <input value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={500} className={`${control} mt-1`} />
    </label>
    <div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={() => void save()} className="platform-button platform-button-primary">{busy ? "Saving…" : "Save"}</button>
      <span role="status" className="text-xs text-zinc-500">{message}</span></div>
  </article>;
}

function SettingsView({ siteId, settings, timezone }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({ ...settings, timezone, cta_link: typeof settings.cta_link === "string" ? settings.cta_link : "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form, value: string | number | boolean) => setForm((old) => ({ ...old, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await saveBlogSettings(siteId, form);
      setMessage(result.message);
      if (result.status === "success") router.refresh();
    } catch { setMessage("Could not save blog settings."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="max-w-3xl rounded-xl border border-[#E8E7E3] bg-white p-6">
    <h2 className="text-lg font-semibold">Blog defaults</h2>
    <p className="mt-1 text-sm text-zinc-500">These defaults are used by the public blog.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Field label="Blog path"><input value={form.blog_path} onChange={(event) => set("blog_path", event.target.value)} className={control} /></Field>
      <Field label="Posts per page"><input type="number" min={1} max={100} value={form.posts_per_page} onChange={(event) => set("posts_per_page", Number(event.target.value))} className={control} /></Field>
      <SelectField label="Index layout" value={form.index_layout} options={["grid", "list", "magazine"]} onChange={(value) => set("index_layout", value)} />
      <SelectField label="Default post layout" value={form.default_post_layout} options={["classic", "wide", "minimal"]} onChange={(value) => set("default_post_layout", value)} />
      <Field label="Site timezone"><input value={form.timezone} onChange={(event) => set("timezone", event.target.value)} placeholder="America/New_York" className={control} /></Field>
    </div>
    <fieldset className="mt-6 grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-semibold">Show on posts</legend>
      {([["show_author", "Author"], ["show_date", "Date"], ["show_reading_time", "Reading time"], ["show_share_links", "Share links"]] as const).map(([key, label]) =>
        <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form[key]} onChange={(event) => set(key, event.target.checked)} />{label}</label>)}
    </fieldset>
    <fieldset className="mt-6 grid gap-3">
      <legend className="mb-2 text-sm font-semibold">Discovery</legend>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.show_in_menu} onChange={(event) => set("show_in_menu", event.target.checked)} />Show Blog in the site menu</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.noindex_tags} onChange={(event) => set("noindex_tags", event.target.checked)} />Ask search engines not to index tag pages</label>
    </fieldset>
    <fieldset className="mt-6 grid gap-3">
      <legend className="text-sm font-semibold">End-of-post call to action</legend>
      <Field label="Text"><textarea value={form.cta_text} onChange={(event) => set("cta_text", event.target.value)} maxLength={300} rows={2} className={control} /></Field>
      <Field label="Button label"><input value={form.cta_button_text} onChange={(event) => set("cta_button_text", event.target.value)} maxLength={80} className={control} /></Field>
      <Field label="Button link"><input value={form.cta_link} onChange={(event) => set("cta_link", event.target.value)} maxLength={2048} placeholder="/contact or https://…" className={control} /></Field>
    </fieldset>
    <p role="status" className="mt-4 text-sm text-zinc-600">{message}</p>
    <button disabled={busy} className="platform-button platform-button-primary mt-4">{busy ? "Saving…" : "Save settings"}</button>
  </form>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs text-zinc-600">{label}<span className="mt-1 block">{children}</span></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)} className={control}>
    {options.map((option) => <option key={option} value={option}>{option.slice(0, 1).toUpperCase() + option.slice(1)}</option>)}
  </select></Field>;
}

export type BlogSettings = {
  blog_path: string; posts_per_page: number; index_layout: "grid" | "list" | "magazine";
  default_post_layout: "classic" | "wide" | "minimal"; show_author: boolean; show_date: boolean;
  show_reading_time: boolean; show_share_links: boolean; show_in_menu: boolean; noindex_tags: boolean;
  cta_text: string; cta_button_text: string;
  cta_link: string | null;
};
