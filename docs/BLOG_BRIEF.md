# SitoMax Blog System — Build Brief

Build a complete, premium blog system for client sites. It must look
and feel better than competitors (DashClicks, Wix): reading-first
design, clean management, strong SEO, honest AI help.

Work in 3 phases. After EACH phase: run build, lint, typecheck and
tests, fix errors, commit "Blog phase X: …", push, then STOP and
summarise. Do not start the next phase until asked.

Respect existing architecture: Supabase RLS by account membership,
draft vs published content, the sanitizer (lib/richtext.ts), Media
Picker, Link Picker, credits/ai_usage, global header/footer, theme
tokens and contrast auto-fix. Migrations use the next free number;
remind me to run them in the Supabase SQL Editor.

---------------------------------------------------------------------
## PHASE A — Data, management and writing

### A1. Data model (migration)
- posts: id, site_id, title (max 200), subtitle, slug (unique per
  site; nested slugs allowed, e.g. seo-basics/meta-tags), excerpt,
  draft_content (JSON), published_content (JSON), cover_image,
  cover_alt, thumbnail_image, thumbnail_alt, author_id, category_id,
  status (draft | scheduled | published), publish_at, published_at,
  has_unpublished_changes, featured, layout_override, seo_title,
  seo_description, canonical_url, noindex, reading_minutes,
  created_at, updated_at.
- post_categories (site_id, name, slug, description), post_tags
  (site_id, name, slug), post_tag_links (post_id, tag_id).
- blog_authors (site_id, name, bio, photo, user_id nullable).
  When a user first writes, auto-create their author profile from
  their name. NEVER display raw IDs anywhere.
- post_redirects (site_id, from_slug, to_post_id) — created when a
  published post's slug changes (301).
- sites.timezone (default from the creator's browser, editable in
  site settings). Scheduling and displayed dates use it.
- RLS: same rules as pages (account members read/write their
  site's posts; public reads only published posts via server
  routes). Column grants consistent with existing patterns.

### A2. Blog manager
- Editor left rail "Blog" item opens a full Blog manager panel with
  sections: Posts, Categories, Authors, Settings (Import is added in
  Phase C).
- Posts list rows: thumbnail, title, created date, author NAME,
  status badge (Draft / Scheduled / Published / Changes not
  published), published date.
  Hover actions: Edit, Settings, Publish/Republish (only when there
  are unpublished changes), ⋯ menu (Duplicate, View live, Unpublish,
  Delete with confirm).
- Search by title, excerpt, tag or author. Filter by status,
  category, author. Sort by created / published / updated / title.
  Bulk: publish, unpublish, delete (confirm).
- Categories & Authors: simple create/edit/delete lists (delete
  asks where to move posts).
- Settings: blog path (default /blog), posts per page, index layout,
  default post layout, show author/date/reading time, share links
  on/off, end-of-post CTA (text, button, Link Picker), timezone.

### A3. Create flow
- "+ New post" opens a quick modal: title (counter, max 200), author
  (dropdown by name, defaults to current user), main image (Media
  Picker, optional). "Start" opens the writer.
- No stock placeholder images or filler text. Start with the title,
  an empty subtitle field and an empty body with the hint:
  "Start writing, type / for blocks, or ✨ Draft with AI".

### A4. Post writer
- Clean, distraction-free writing view using the site's fonts.
- Blocks: paragraph, headings (H2–H4), bulleted/numbered lists,
  quote, callout, image (Media Picker, caption, alt), gallery,
  video/embed (existing allowlist), button (Link Picker), divider,
  table. "/" slash menu to insert blocks; inline toolbar on focus
  with Link (Ctrl/Cmd+K → Link Picker).
- Autosave drafts, revision history (restore), Preview, Publish /
  Schedule / Unpublish / Republish. Edits to a published post stay
  in draft until Republish ("Changes not published").
- All content passes through the sanitizer.

### A5. Post settings drawer (3 tabs, with ‹ › arrows to move
between posts)
1. Status: URL slug (copy button, validation, uniqueness, nested
   slugs, auto 301 redirect when changed on a published post),
   publish date/time showing the site timezone AND UTC, buttons
   Publish / Schedule / Unpublish / Republish.
2. Details: title, subtitle/excerpt, author, main image (Replace /
   Edit alt / Remove), category, tags (create inline), featured
   toggle, post layout override.
3. SEO: meta title (counter; ideal 50–60, warn >60), meta
   description (counter; ideal 140–160, warn outside range),
   thumbnail/social image (defaults to main image) + alt text,
   noindex toggle, canonical URL (advanced), Google and social
   previews. Note: "Schema markup and Open Graph tags are generated
   automatically."
- "All alt text" view: every image in posts with missing or weak
  alt text, editable inline.

---------------------------------------------------------------------
## PHASE B — Public blog, sections and SEO

### B1. Public routes
/blog, /blog/[...slug], /blog/category/[c], /blog/tag/[t],
/blog/author/[a], with pagination. Old slugs 301 to new ones.

### B2. Index layouts
- Grid (cards), List (image left, text right), Magazine (featured
  post hero + grid). Category filter chips, search box.

### B3. Post layouts
- Classic centered (max ~70ch), Wide with sidebar (table of
  contents + related posts), Minimal.
- Include: category, title, subtitle, author card (photo, name,
  bio), date in site locale, reading time, cover image, automatic
  table of contents from headings, polished typography (comfortable
  line height, spacing, styled quotes/callouts/tables/images), share
  links as clean icon buttons (copy link, X, Facebook, LinkedIn,
  email — no gradient bars, no tracking scripts), related posts,
  previous/next post, end-of-post CTA, breadcrumbs.
- Uses the global header/footer, site theme and contrast auto-fix.
  Responsive and accessible.

### B4. Section designs for any page
"Latest posts", "Featured posts", "Posts by category". Layouts:
cards grid, list, carousel, featured + list. Options: number of
posts, category, show excerpt/date/author, "View all posts" button.

### B5. SEO and performance
- Article + BreadcrumbList JSON-LD, canonical URLs, Open Graph /
  Twitter cards (thumbnail or cover), RSS at /blog/rss.xml, posts in
  sitemap.xml, optional noindex for tag pages, respect per-post
  noindex.
- Revalidate affected pages on publish/unpublish. Optimized images,
  no layout shift.
- Blog page appears in the header menu automatically (can hide).

---------------------------------------------------------------------
## PHASE C — AI and import

### C1. AI (uses credits, logged in ai_usage; Haiku for small tasks,
Sonnet for drafting)
- "✨ Draft with AI": from a topic or outline, in the site's voice,
  using business info.
- Improve / shorten / expand / change tone of selected text.
- Suggest titles, subtitle, excerpt, meta title and description
  (to the right length), tags, category, alt text.
- Never invent facts, statistics, quotes, studies or sources. Use
  [placeholders] and flag claims for the author to verify.

### C2. Import
- Sources: WordPress export (WXR .xml file) and RSS/Atom feed URL.
- Map: title, content (convert HTML to our blocks via the
  sanitizer), excerpt, publish date, author, categories, tags,
  cover image, slug (KEEP original slugs to preserve SEO).
- Download images into site-assets and rewrite URLs.
- Preview before import, then a results report (imported / skipped
  / errors). Imported posts start as drafts unless the user chooses
  "Keep published status".
- Skip duplicates (same slug) unless "overwrite" is chosen.

---------------------------------------------------------------------
## General requirements
- Works on desktop and tablet; client owners and editors can write
  posts; super admin can manage all.
- Tests: slugs and redirects, RLS, scheduling (timezone), status
  transitions, sanitizer, import mapping.
- Final summary per phase: what was built, migrations to run, any
  limitations.