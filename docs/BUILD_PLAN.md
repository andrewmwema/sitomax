# SitoMax build plan: v1 (paste each prompt into Copilot Chat)

**How to use this:**
1. Put this file at `docs/BUILD_PLAN.md` and `copilot-instructions.md` at `.github/copilot-instructions.md` in your repo.
2. In Copilot Chat, switch to **Agent mode** so it can create files and run commands.
3. Do one phase at a time. Paste the prompt, review the changes, run the **Check** steps, then commit before moving on (`git add . && git commit -m "Phase X"`).
4. If something breaks, paste the full error into Copilot and say: "Fix this without changing the architecture in copilot-instructions.md."

---

## Phase 0: Project setup

**Do these yourself first:**
- Create a free Supabase project. Copy the Project URL, the anon key and the service role key from Project Settings → API.
- In the Codespace terminal: `npm i -g supabase` (Supabase CLI).

**Prompt:**
```
Read .github/copilot-instructions.md. Set up the project:
1. Create a Next.js 16 app in the current folder (TypeScript, App Router, Tailwind v4, ESLint, no src dir, import alias @/*).
2. Install: @supabase/ssr @supabase/supabase-js @puckeditor/core zod.
3. Create .env.example with every variable listed in copilot-instructions.md, and add .env.local to .gitignore.
4. Create lib/supabase/server.ts, lib/supabase/client.ts and lib/supabase/admin.ts (admin uses the service role key and starts with import "server-only").
5. Create .devcontainer/devcontainer.json for Codespaces with Node 22, forwarding port 3000.
6. Create the folder structure from copilot-instructions.md with placeholder pages so the app runs.
```
**Check:** copy `.env.example` to `.env.local` and fill it in. Then `npm run dev` should open on port 3000.

---

## Phase 1: Database and security

**Prompt:**
```
Create supabase/migrations/0001_init.sql with exactly this schema, plus RLS on every table:

- agency_settings (single row): id int pk default 1 check (id = 1), name text, logo_url text, primary_color text, support_email text
- profiles: id uuid pk references auth.users on delete cascade, email text, full_name text, is_super_admin boolean default false, created_at timestamptz default now()
  + trigger: insert a profile row when a new auth.users row is created
- accounts (client sub-accounts): id uuid pk default gen_random_uuid(), name text not null, created_at
- account_members: account_id uuid references accounts on delete cascade, user_id uuid references profiles on delete cascade, role text check (role in ('owner','editor')), primary key (account_id, user_id)
- sites: id uuid pk, account_id uuid references accounts on delete cascade, name text, subdomain text unique not null, custom_domain text unique, domain_verified boolean default false, theme jsonb default '{}', template_key text, created_at
- pages: id uuid pk, site_id uuid references sites on delete cascade, slug text not null ('' = home), title text, draft_data jsonb default '{}', published_data jsonb, published_at timestamptz, seo jsonb default '{}', sort_order int default 0, unique (site_id, slug)
- form_submissions: id uuid pk, site_id uuid references sites on delete cascade, page_path text, form_name text, data jsonb, is_read boolean default false, created_at
- page_views: id bigint generated always as identity pk, site_id uuid references sites on delete cascade, path text, referrer text, device text, country text, visitor_hash text, created_at timestamptz default now()
  + index on (site_id, created_at)

Helper functions (security definer, stable, search_path = public):
- is_super_admin() returns boolean
- is_account_member(acc uuid) returns boolean
- is_account_owner(acc uuid) returns boolean

RLS policies:
- Super admin can do everything on every table.
- profiles: users can read and update their own row (but never change is_super_admin).
- accounts / account_members: members can read their own account; owners can manage editors.
- sites and pages: members of the site's account can select/update; only super admin can insert/delete sites; owners and editors can insert/delete pages.
- form_submissions and page_views: account owners can read; NO public insert policy (inserts happen server-side with the service role).
- agency_settings: anyone authenticated can read; only super admin can update.

Then add supabase/seed.sql that inserts the agency_settings row.
Explain how to apply it with the Supabase CLI (supabase link + supabase db push).
```
**Check:** the tables show up in Supabase → Table Editor. Sign up once later, then in the SQL editor run `update profiles set is_super_admin = true where email = 'YOUR EMAIL';`

---

## Phase 2: Login, dashboard and white-label branding

**Prompt:**
```
Build auth and the dashboard shell:
1. /login page: email magic link via Supabase Auth, plus an auth callback route. Branded with agency_settings (name, logo, primary color). No mention of Supabase anywhere in the UI.
2. Protect /dashboard and /editor: redirect to /login if not signed in.
3. Dashboard layout with sidebar: Sites, Forms, Analytics, Settings. Super admins also see Clients.
4. Clients page (super admin only): list accounts, create an account, and invite an owner by email (use supabase.auth.admin.inviteUserByEmail on the server, then add the account_members row).
5. Sites page: super admin sees all sites grouped by client; clients see only their own sites. Each site card shows name, live URL, Edit button, and Domain status.
6. Settings page (super admin): edit agency_settings (name, logo upload to Supabase Storage bucket "branding", primary color).
Use clean, modern Tailwind styling with the agency primary color as a CSS variable.
```
**Check:** log in, become super admin, create a test client and invite yourself on a second email.

---

## Phase 3: Multi-tenant routing (serve each client's site)

**Prompt:**
```
Implement multi-tenant routing exactly as described in copilot-instructions.md:
1. proxy.ts: read the host, refresh the Supabase session for app routes, and rewrite tenant hosts to /s/[site]/[[...slug]]. Skip _next, api, and static files.
2. lib/tenant.ts: getSiteByHost(siteParam) that checks sites.subdomain first, then sites.custom_domain (only if domain_verified). Use the admin client and cache with React cache().
3. app/s/[site]/[[...slug]]/page.tsx: load the site and the page by slug, return notFound() if missing or unpublished, render published_data with Puck's <Render> and the Puck config, wrap it in the site theme CSS variables, and generate metadata from pages.seo.
4. Make subdomains work in dev at http://{subdomain}.localhost:3000.
```
**Check:** insert a test site with subdomain `demo` and a page with published_data, then open `demo.localhost:3000`. (In Codespaces, test with a `?__host=demo` query override if subdomains don't work on the forwarded URL. Ask Copilot to add that dev-only override.)

---

## Phase 4: Drag-and-drop editor (the Wix part)

**Prompt:**
```
Build the visual editor with Puck:
1. lib/puck/config.tsx registering these blocks (each in components/blocks/, each fully editable through Puck fields, mobile responsive, using theme CSS variables):
   Hero (heading, subheading, button text/link, background image, layout: centered/split)
   TextSection, ImageWithText, Services (repeatable cards with icon/title/text), Gallery, Testimonials, Pricing, FAQ (accordion), CallToAction, ContactForm (form name + fields list), Map (address embed), Spacer, Footer (business name, phone, address, social links).
   Use Puck categories: Layout, Content, Media, Conversion.
2. Puck root fields for page title and SEO description.
3. /editor/[pageId]: full-screen Puck editor. Load draft_data. Buttons: Save draft (writes draft_data), Preview (opens the live URL with ?preview=1, which shows draft_data to logged-in members only), Publish (copies draft to published_data and sets published_at).
4. Theme panel: site colors (primary, secondary, background, text), heading/body fonts from a short Google Fonts list, logo upload. Save to sites.theme.
5. Pages manager on the site page: add, rename, reorder and delete pages, set the home page.
6. Image uploads go to a Supabase Storage bucket "site-assets" in a folder per site.
Check access on the server: only members of the site's account or super admin can open the editor.
```
**Check:** log in as the client user, edit a page, publish, and see it live.

---

## Phase 4b: Upscale blocks, rich text and section designs (run prompts A–F in order)

**Before you start:** take screenshots of each section of the reference designs (hero, services, about, reviews, pricing, contact, footer) from the design canvas, in both styles: "Classic" (navy and brass) and "Modern" (bright and rounded). Attach the matching screenshots to each prompt in Copilot Chat. Commit after each prompt.

**Prompt A: design foundation**
```
Read .github/copilot-instructions.md. Create a shared design foundation for all Puck blocks so every site looks professional:

1. lib/theme/presets.ts: two style presets stored in sites.theme.style:
   - "classic": serif display headings (DM Serif Display) + Inter body, 4–6px corner radius, navy/brass style, small uppercase eyebrow labels with letter-spacing.
   - "modern": Plus Jakarta Sans 700/800 headings + Inter body, 16–24px radius, soft shadows, pill badges.
   Each preset sets CSS variables: --font-heading, --font-body, --radius-sm, --radius-lg, --shadow-card, --section-pad (96–112px desktop, 64px mobile), --container (1200px).
   Colors stay from the theme: --color-primary, --color-secondary, --color-bg, --color-text, plus computed --color-muted, --color-soft-bg, --color-border, --color-on-primary (white or dark, whichever passes WCAG 4.5:1 contrast).
2. Load the site's selected heading and body fonts through Google Fonts with `display=swap`; defaults follow the style preset. The theme panel loads font previews when a picker opens.
3. components/blocks/ui/: shared primitives every block must use: Container, Section (background: "default" | "soft" | "dark" | "primary"), Eyebrow, Heading (h1/h2/h3 with fluid clamp() sizes), Button (primary / secondary / ghost, min-height 48px, hover + focus-visible styles), Card, Badge, IconTile.
4. Icons: install lucide-react. Create an IconPicker custom Puck field (searchable list of ~60 relevant icons: wrench, droplet, flame, scissors, utensils, home, shield-check, clock, star, phone, etc.). Remove all emoji icons from blocks.
5. Theme panel: add a "Style" switch (Classic / Modern), and a color picker that shows preset palettes (Navy & brass, Ocean blue, Forest green, Charcoal & gold, Plum).
Typography rules: max ~65 characters per line for body text, line-height 1.6, headings letter-spacing -0.5px to -1.5px, generous spacing between sections. No gradient backgrounds, no emoji.
```

**Prompt B: rich text and inline editing**
```
Add Word-style text editing using Puck's built-in rich text field (@puckeditor/core 0.24 supports field type "richtext", powered by TipTap):
1. Change every multi-line body text field (Text section, Image with text, FAQ answers, Services descriptions, About text) from "textarea" to { type: "richtext", contentEditable: true } so users can edit directly on the page and in the sidebar, with bold, italic, underline, links, bulleted and numbered lists, headings H2–H4, and text alignment.
2. Set contentEditable: true on short "text" fields (headings, button labels) so clients can click and type on the canvas.
3. Style rich text output in a shared .rich-text class: paragraph spacing, list bullets/numbers, link color from --color-primary, headings using --font-heading.
4. SECURITY: rich text is stored as HTML in draft_data / published_data. Sanitize it with isomorphic-dompurify both when saving (server action) and when rendering on the public site. Allow only: p, br, strong, em, u, a (href, target, rel), ul, ol, li, h2, h3, h4, blockquote. Force rel="noopener noreferrer" on links and block javascript: URLs. This prevents a client from injecting scripts that would run for site visitors or for the super admin opening their editor.
5. Migrate existing plain-text values so nothing breaks (treat a plain string as a paragraph).
```

**Prompt C: section shell + "Row design" panel (applies to every block)**
```
Create components/blocks/ui/SectionShell.tsx and wrap EVERY block in it, so every section has the same design controls in the right-hand panel, grouped in 4 tabs (use Puck custom fields and an object field named "design"):

1. Settings: full-bleed toggle (edge-to-edge vs 1200px container), anchor ID (for menu links like #pricing), hide on desktop / tablet / mobile toggles.
2. Style:
   - Background tabs: Color (theme swatches + custom picker + "none"), Image (one image, or several images as an auto-rotating background slider; overlay color + opacity 0–80% so text stays readable; focal point), Video (upload MP4/WebM up to 50MB to Supabase Storage bucket "site-assets", OR a YouTube/Vimeo URL; muted, looped, plays inline, with a poster image and an overlay).
   - Border: width 0–8px slider + color; corner radius.
   - Shadow: toggle + presets (soft / medium / strong).
   - Text color: auto (picks light or dark text based on the background for 4.5:1 contrast) / light / dark.
3. Animation: trigger (none / on entrance / on scroll), animation (fade, fade up, fade down, slide left, slide right, zoom in), duration, delay. Use IntersectionObserver + CSS, no heavy libraries. Respect prefers-reduced-motion (no animation). Never animate inside the editor canvas while editing.
4. Spacing: a visual box control like a margin/padding diagram (outer box = margin, inner box = padding, 4 sides each, values in px with a slider), with a device switcher: desktop, tablet, mobile. Defaults come from --section-pad. Include "Clear all padding".

SECURITY: only accept video URLs from youtube.com, youtu.be and vimeo.com and render them as privacy-friendly embeds (youtube-nocookie.com); validate uploads by MIME type and size on the server; never allow raw CSS or HTML input.
```

**Prompt D: section design library (multiple polished designs per block)**
```
Build a section design library like professional site builders:

1. lib/sections/catalog.ts: a catalog of "designs". Each design = { id, blockType, category, name, thumbnail, props (complete preset props including the design object from SectionShell), styles: ["classic","modern"] }. Categories: Hero, Features/Services, About, Stats, Process, Testimonials, Pricing, Team, Gallery, Logos, FAQ, Call to action, Contact, Footer.
2. "Add section" button between every section on the canvas (and at the end of the page). Clicking opens a modal: "What type of section?" → Blank (block with minimal defaults) or Designed (a gallery of designs filtered by category with thumbnails; click to insert at that position). Also keep drag-and-drop from the Elements list.
3. Every block gets a "variant" field (layout) so a design can switch layout without losing content. Changing variant keeps the text and images.
4. Supabase migration 0005_section_designs.sql: table section_designs (id uuid pk, name, category, block_type, props jsonb, thumbnail_url, created_by uuid, is_global boolean default true, created_at). RLS: any authenticated user can select; only super admin can insert/update/delete. (I apply migrations by hand in the SQL Editor; just create the file.)
5. Super admin only: "Save as design" action on any section in the editor; it saves the section's props + a screenshot thumbnail (html-to-image) to section_designs, so I can create new designs visually and offer them to all clients. The Designed gallery shows catalog designs + saved designs.
6. Thumbnails: generate them by rendering each design at 1280px wide and scaling down, cached.
```

**Prompt E: build the designs (run in batches, attach reference screenshots each time)**
```
Using the catalog from Prompt D, the SectionShell and the shared ui primitives, create polished designs, each with professional default copy for a generic local business and placeholder images. Every design must work in both Classic and Modern style, be responsive at 375/768/1280px, and look finished the moment it is inserted. Original layouts only (inspired by the attached references, not copies).

Batch 1: Hero ×6 (split image, centered with badge, full-width photo with overlay, video background, hero with lead form, hero with stats row)
Batch 2: Features/Services ×6 (icon grid 3-col, bordered grid, image cards, alternating image rows, list with icons, tabs) + Stats ×3
Batch 3: Pricing ×4 (3 cards with highlighted plan, monthly/yearly toggle, comparison table, single plan with checklist) + FAQ ×3 (accordion, two-column, with contact sidebar)
Batch 4: Testimonials ×4 (cards, single large quote, carousel, rating summary + cards) + Logos ×2 + Team ×3
Batch 5: Call to action ×4 (dark band, primary band, image background, split with form) + Contact ×3 + Footer ×3 + About ×3 + Process ×3 + Gallery ×3
After each batch, list the designs created.
```

Batch 2 catalog designs:
- Features/Services: Icon grid (three columns), Bordered service grid, Image service cards, Alternating image rows, Heading with icon list, Service explorer tabs.
- Stats: Editorial numbers row, Milestone metric cards, Photo & numbers.

All nine support Classic/Modern themes and the shared SectionShell controls.
Services layouts share the same editable content and photos when switching variants.
Tabs support arrow keys, Home and End. Stats use bracketed example values that
the existing publish warning flags until replaced with verified business facts.

Batch 3 catalog designs:
- Pricing: Three cards with a highlighted plan, Monthly/yearly plans, Plan comparison table, Single plan with checklist.
- FAQ: Accordion, Two-column answers, FAQ with contact sidebar.

The billing toggle uses explicitly entered yearly prices, not an inferred discount.
If a plan has no yearly price, it asks visitors to enquire. Comparison rows come
from matching feature names across plans and become plan-by-plan checklists on
mobile. The legacy simple pricing layout remains supported for saved pages.
FAQ layouts preserve the same questions and rich-text answers; accordion designs
can start with the first answer open. Prices and business-specific facts remain
bracketed examples for the editor's existing publish warning.

Batch 4 catalog designs:
- Testimonials: Review cards, Single large quote, Customer story carousel, Rating summary + cards.
- Logos: Understated wordmark strip, Partner tile grid.
- Team: Team photo cards, Editorial team profiles, Meet the founder.

The testimonial carousel supports touch/trackpad scrolling, Previous/Next buttons,
Left/Right/Home/End keys and reduced motion. It never advances automatically.
Quotes, ratings, partner names and team identities are bracketed samples, not
endorsements or verified business facts. Logo uploads replace the original
placeholder wordmarks; team photos use the existing royalty-free sample images.
All people and reviews are retained when switching layouts.

Batch 5 catalog designs:
- Call to action: Dark band, Primary band, Photo invitation, Project invitation + form.
- Contact: Centered form, Split form, Visit & enquire.
- Footer: Columns, Centered, Light compact footer.
- About: Image with story, Wide-photo brand story, Photo + guiding values.
- Process: Numbered step cards, Editorial process timeline, Photo + process checklist.
- Gallery: Grid, Masonry, Featured project mosaic.

All designs use SectionShell, the site theme and shared UI primitives. Photo CTAs
have a 58% dark overlay and the shared contrast-aware buttons. Contact and CTA
forms share labelled fields, native validation and the existing POST contract at
`/api/forms/submit`; that endpoint is not implemented yet, so these forms are not
ready to collect submissions. Form backend work remains in the forms phase.
Footer contact details, location information and project captions are bracketed
samples. Gallery photos and captions stay intact when changing layouts. Legacy
CTA split, About text and Map blocks remain available on saved pages.
The publish check also detects long and multiline bracketed sample quotations.
Both batches were checked in Classic and Modern at 375/768/1280px, including
carousel mouse/keyboard navigation, reduced motion, field labels, native form
validation, image loading, overflow and CTA button contrast.

**Prompt F: polish pass**
```
Do a visual polish pass on all designs:
1. Consistent vertical rhythm using --section-pad; no hard-coded margins.
2. Card hover effects (lift 2px + shadow in Modern, border color change in Classic).
3. Mobile: nav collapses to a menu button, buttons full width under 480px, no horizontal scroll anywhere.
4. Editor: the Elements list shows a thumbnail per block; the Designed gallery has a search box.
5. Update the 4 templates in templates/ to use the new designs, then list anything that still looks unfinished.
```
**Check:** click "Add section" → Designed → insert a Pricing design, then change its background to an image, add a fade-up animation, and change the mobile padding. Switch the site Style between Classic and Modern. Every design should look finished without editing; bold, italic and bullets should work in body text.

Polish implementation:
- Section spacing and inter-content margins derive from `--section-pad` through
  `--section-gap`, `--content-gap` and `--detail-gap`. Authored per-device
  SectionShell spacing remains supported.
- Shared cards lift 2px with a stronger shadow in Modern; Classic changes the
  border color without lifting. Reduced-motion preferences disable movement.
- Action buttons and form submit buttons fill their container below 480px.
  Carousel, billing and menu controls remain compact. Navigation is an editable
  block with a collapsible menu below 768px, Escape handling and focus restoration.
  Existing saved pages do not receive navigation automatically.
- Elements and Blank blocks have thumbnails; live previews are inert, sandboxed
  and mounted near the visible list area. Designed search matches names, categories and block types
  across built-in and saved designs. Saved-design failures show a retry notice.
- Gallery previews use equal 16:10 frames, scale to card width and crop from the
  top without scrollbars. Short previews (including saved screenshots) fill with
  the section background, and single-line labels stay aligned. Pricing cards,
  including the highlighted plan, use a surface distinct from the section.
- Plumber, salon, restaurant and general-business templates now compose catalog
  designs into Home, About, Services and Contact pages, including navigation and
  footer. Template `{{businessName}}`-style tokens also trigger publish warnings.

Still unfinished: template selection/application in the create-site wizard,
the `/api/forms/submit` backend, and replacing sample copy, reviews, contact details
and stock photos with real business content (especially salon/restaurant photos).
The video hero needs an actual video URL; its default presentation uses a poster.

---

## Phase 4c: Pro editor experience (sleeker than the competition)

Run after Phase 4b. Attach your DashClicks editor screenshots as references, and tell Copilot to make ours cleaner, not a copy.

**Prompt A: flexible layouts (columns + elements inside sections)**
```
Read .github/copilot-instructions.md. Add a flexible layout system using Puck slot fields, alongside the designed blocks:
1. Layout hierarchy: Section → Row (1–4 columns with ratio presets: 1/1, 1/2+1/2, 1/3+2/3, 2/3+1/3, 1/3×3, 1/4×4; stack on mobile with option to reverse order) → Elements.
2. Elements: Heading, Text (rich text), Button, Image, Icon, Icon list, Video (YouTube/Vimeo/upload), Divider, Spacer, Social icons, Map, Form, Countdown, Badge, Stat number, Embed (super admin only; see security below).
3. Sections, rows, columns and elements all get the SectionShell-style design controls appropriate to their level (Style / Animation / Spacing; columns also get vertical alignment).
4. "Blank" section = an empty Section with one Row. Designed sections stay as before; add a "Convert to custom layout" action that turns a designed section into Section/Row/Element blocks so it can be freely rearranged.
5. Guardrails so clients can't make sites look broken: spacing values snap to a scale (0, 4, 8, 12, 16, 24, 32, 48, 64, 80, 96, 128), font sizes come from the type scale (with "custom" allowed), fonts limited to a curated list of ~25 good Google Fonts, and colors default to the theme palette.
```

Implemented. Layout blocks live in `components/blocks/layout/` (Section, Row, and the
internal Column, which is created by Row and can't be dragged or deleted on its own;
columns have a theme-aware "Card style" of None, Card or Highlighted).
Each element has its own file in `components/blocks/elements/`. All of them are
inline Puck blocks, so the editor and the public site render the same DOM. The
guardrails live in `lib/layout/` (spacing scale, type scale with a clamped custom
size, 25 curated Google Fonts, and theme colors with a validated hex fallback).
"Blank" in the section library offers the six row presets. "Convert to custom
layout" in the action bar converts every designed section except Navigation and
Spacer. Embed is hidden and locked for clients in the editor, checked again in
`updatePage`, and enforced in Postgres by migration
`0007_layout_embeds.sql` (run it by hand). Clients may keep, move or delete
embeds the agency placed, but can't add or change embed code. That also means a
client can't insert a saved design that contains an embed unless the same code is
already on the page. Embed code renders only in an iframe with
`sandbox="allow-scripts"` (never `allow-same-origin`).

**Prompt B: section library panel**
```
Replace the "Add section" modal with a docked section library panel (left side, slides in over the block list):
1. Category list on the left: Hero, Services, About, Text & Image, Text blocks, Stats, Logos, Team, Testimonials, Pricing, FAQ, Call to action, Contact, Gallery, Portfolio, Video, Tabs, Promotion, Social, Events, Restaurant menu, Coming soon, Full page, Footer, Blank. Show the number of designs next to each category.
2. Tabs: "Designed" (catalog + saved designs) and "Saved" (sections I saved with "Save as design"; super admin can mark them global).
3. Thumbnails rendered LIVE in the current site's theme (its colors, fonts and Classic/Modern style), not generic screenshots, so clients see how each design will look on their own site. Render them in a sandboxed iframe at 1280px and scale down; lazy-load as the user scrolls.
4. Hover a thumbnail → a ghost preview of the section appears in the canvas at the insertion point; click to insert, Esc to cancel. A zoom icon opens a large preview.
5. Search box and a grid/list toggle.
6. Insertion point: a slim "+" button appears between sections on hover; the panel inserts there.
```

Implemented in `components/editor/section-library.tsx`. The non-modal dock slides
over the block list, with category counts, Designed/Saved tabs, search and
grid/list views. Empty categories remain visible for future catalog additions;
legacy Services, Text and Process categories remain readable. Text & Image also
shows the existing About image/text designs.

Every thumbnail renders live at 1280px in the current theme and style, including
saved designs with legacy screenshots. Iframes are lazy-mounted near the scroll
viewport and sandboxed without scripts; zoom shows the full-height design.
`section-ghost.tsx` inserts an inert preview into the canvas DOM at the chosen
boundary without touching page data or history. Escape cancels from either the
panel or canvas; within zoom it closes only the large preview. A committed insert
creates one undo entry and re-keys nested layout slots to avoid duplicate IDs.

All signed-in users can save private designs; Saved shows the current user's
designs. Only the agency can share/unshare globally. Run
`supabase/migrations/0008_saved_design_visibility.sql` by hand to enable the
creator/global RLS policies (existing shared designs stay global). Design saves
now store content only; screenshot capture/upload is no longer needed.

**Prompt C: text toolbar, context menu and selection**
```
Polish editing interactions:
1. Floating rich text toolbar (appears above selected text, never covers it): bold, italic, underline, strikethrough, text color (theme swatches + picker), highlight, clear formatting, style dropdown (Paragraph, Heading 1–4, Small, Quote), font family (curated list), font size (scale + custom), link (with "open in new tab" and page picker), alignment, line height, bulleted and numbered lists, indent, undo/redo. Keyboard shortcuts: Ctrl/Cmd+B, I, U, K.
2. Right-click context menu (and a "⋯" button on the selection outline) for any section, row, column or element: Edit content, Edit design, Add element below, Duplicate, Copy / Paste (works across pages and sites of the same account), Move up / down, Align left / center / right, Animation, Hide on (desktop / tablet / mobile), Set as anchor (with copy link), Select parent (Section › Row › Column › Element breadcrumb), Save as design (super admin), Delete (with undo toast).
3. Breadcrumb bar at the bottom of the canvas showing the current selection path; click any level to select it.
4. Inspector: one docked panel on the right with tabs (Content / Style / Animation / Spacing) instead of floating dialogs that cover the page.
5. Device switcher (desktop / tablet / mobile) where style and spacing changes can be set per device; show a small device icon next to any value that differs on mobile.
6. Command palette (Ctrl/Cmd+K): "Add pricing section", "Go to About page", "Change theme color", "Publish".
7. Autosave drafts every 10 seconds with a "Saved" indicator; version history (keep the last 20 published versions with restore).
SECURITY: "Embed" and any custom HTML/CSS are super admin only, rendered inside a sandboxed iframe (sandbox="allow-scripts" without allow-same-origin), never injected into the page directly. Clients never get raw HTML/CSS editing.
```

Editor interactions use the docked inspector and a 10-second draft autosave.
Published history is separate from drafts: restore changes the draft only.
Run `supabase/migrations/0009_page_versions.sql` in the SQL editor before using
history; it seeds existing publications, enforces RLS, and retains 20 versions.
Responsive spacing and the appearance controls (background, text color, radius,
alignment) support device overrides; the other design controls remain shared.
Saving designs is currently limited to top-level sections, and column
duplicate, move, and delete actions are disabled to preserve row presets.

**Prompt D: more designs for the new categories (attach references)**
```
Add designs to the catalog for the new categories, same quality rules as Phase 4b Prompt E: Text blocks ×3, Tabs ×2, Portfolio ×3, Video ×3, Promotion ×3, Social ×2, Events ×2, Restaurant menu ×3, Coming soon ×4 (with countdown and email signup), Full page ×4 (complete one-page layouts combining existing designs).
```
Added so far: Framed introduction, Editorial split and Accent statement;
Vertical image tabs and Simple text tabs; Editorial project rows, Project cards
and Featured work. The other categories in Prompt D are not yet implemented.
**Check:** insert a section from the library and watch the thumbnail match your site's colors. Right-click a heading, change its color and font, set it as an anchor, and hide it on mobile. Use Ctrl+K to add a pricing section. Undo everything.

---

## Phase 5: Niche templates + "create site" wizard

**Prompt:**
```
Add templates:
1. templates/ folder with 4 templates as TypeScript files: plumber, salon, restaurant, general-business. Each defines a theme plus pages (Home, About, Services, Contact) as Puck data using our blocks.
2. Use placeholders in template text like {{businessName}}, {{phone}}, {{city}}, {{services}}, {{email}}, {{address}}.
3. "New site" wizard (super admin): choose client → choose template (cards with preview) → enter business info + subdomain (validate availability and format) → create the site and pages with placeholders replaced, and drafts already published.
```
**Check:** create a plumber site in under a minute and open it on its subdomain.

The agency can create a site from the Sites dashboard. The wizard checks
subdomain availability and creates the site and four published pages atomically.
Apply `supabase/migrations/0010_create_template_site.sql` after migration 0009.
The new pages omit sample testimonials, team members, statistics and opening
hours; sample photos should still be replaced. Contact forms use the existing
form contract, whose submission endpoint is not yet implemented.

---

## Phase 6: Contact forms

**Prompt:**
```
Make the ContactForm block work:
1. Public POST /api/forms/submit: validate with zod, include a hidden honeypot field and a simple rate limit by IP, resolve the site from the host, insert into form_submissions with the admin client.
2. The block shows success/error states.
3. Dashboard Forms page: table of submissions per site, mark as read, view details, export CSV. Unread count badge in the sidebar.
4. Optional: email the account owner on new submissions using Resend (behind a RESEND_API_KEY env var; skip quietly if not set).
```
**Check:** submit the form on a live site and see it in the dashboard.

---

## Phase 7: Analytics

**Prompt:**
```
Add simple privacy-friendly analytics:
1. A tiny client script on tenant pages that sends a beacon to POST /api/analytics on page load (path, referrer). Skip preview mode and logged-in editors.
2. The API route resolves the site from the host, computes visitor_hash = sha256(ip + user-agent + today's date + secret salt) (store no raw IP), gets device from user-agent and country from Vercel's x-vercel-ip-country header, and inserts into page_views.
3. Dashboard Analytics page per site: date range picker (7/30/90 days), visits, unique visitors, form submissions, a line chart of visits per day, and top pages, top referrers and device split. Do the aggregation in SQL.
```
**Check:** visit a site a few times and see the numbers move.

---

## Phase 7b: SEO toolkit

**Prompt:**
```
Add an SEO toolkit for client sites. Read copilot-instructions.md first.

1. Migration supabase/migrations/0004_seo.sql:
   - Add sites.seo jsonb not null default '{}' (holds: business type, business name, address, phone, opening hours, default social share image, Google Search Console verification code, Google Analytics ID, Meta Pixel ID).
   - Grant update (seo) on public.sites to authenticated, so account members can edit it (members may still only update name, theme and seo).
   - Create table redirects: id uuid pk, site_id uuid references sites on delete cascade, from_path text not null, to_path text not null, created_at, unique (site_id, from_path). Enable RLS: account members can select/insert/update/delete redirects for their own sites; super admin can do everything.
   (I run migrations by hand in the Supabase SQL Editor, so just create the file.)

2. Per-page SEO in the editor (Puck root fields, stored in pages.seo): SEO title, meta description, social share image, and a "hide from search engines" (noindex) toggle. Fall back to the page title and site defaults when empty.

3. Tenant page metadata (generateMetadata in app/s/[site]/[[...slug]]/page.tsx): title, description, canonical URL (custom domain if verified, otherwise subdomain), Open Graph and Twitter card tags, robots noindex when set, and the Google Search Console verification meta tag from sites.seo.

4. Structured data: render a JSON-LD LocalBusiness (or the chosen schema.org business type) script on every tenant page from sites.seo: name, address, phone, opening hours, URL, logo.

5. Per-site sitemap.xml and robots.txt for tenant hosts: list published pages that are not noindex; robots.txt points to the sitemap.

6. Tracking codes: if sites.seo has a Google Analytics ID or Meta Pixel ID, load those scripts on tenant pages with next/script (afterInteractive). Never in preview mode or the editor.

7. Redirects: in proxy.ts (or the tenant route), if the requested path matches a redirect for that site, return a 301 to to_path. Cache lookups.

8. Images: the Image block and Gallery must have an alt text field, and use next/image with lazy loading. Allow the Supabase Storage domain in next.config.ts images.remotePatterns.

9. Dashboard "SEO" tab on each site's page (owners, editors and super admin):
   - Business info form (writes sites.seo) with a business type dropdown (Plumber, HairSalon, Restaurant, LocalBusiness, etc.).
   - Tracking codes and Search Console verification fields with short help text.
   - Redirects manager (add/delete, validate paths start with "/").
   - SEO checklist per page with a simple score: missing or too long title (over 60 chars), missing or too long description (over 160 chars), missing social image, images missing alt text, page has no H1 heading, page is noindex. Show green/amber/red and a "Fix" link that opens the editor.
Validate everything with zod.
```
**Check:** open a client site, view the page source (Ctrl+U) and confirm the title, description, `og:` tags and the `application/ld+json` script are there. Visit `/sitemap.xml` and `/robots.txt` on the site. Paste the URL into Google's Rich Results Test (search for it) to confirm the business info is read correctly.

---

## Phase 8: Custom domains

**Do this yourself first:** in Vercel → Account Settings → Tokens, create a token. Copy your Project ID from Project Settings.

**Prompt:**
```
Build custom domain connection with the Vercel REST API in lib/vercel/domains.ts (server only, Bearer VERCEL_API_TOKEN, add ?teamId= if VERCEL_TEAM_ID is set):
- addDomain(domain): POST https://api.vercel.com/v10/projects/{projectId}/domains
- getDomain(domain): GET /v9/projects/{projectId}/domains/{domain} (verified + verification records)
- getDomainConfig(domain): GET /v6/domains/{domain}/config (misconfigured + recommended records)
- verifyDomain(domain): POST /v9/projects/{projectId}/domains/{domain}/verify
- removeDomain(domain): DELETE /v9/projects/{projectId}/domains/{domain}

Domain settings page for each site (owners + super admin):
1. Enter a domain (normalize: lowercase, strip http(s):// and trailing slash; validate with zod). Save to sites.custom_domain, call addDomain, and also add the www version that redirects to the root.
2. Show a DNS instructions table using the recommended values from Vercel's response (A record for the root domain, CNAME for www, plus any TXT verification record). Copy buttons on each value.
3. Status badge: Pending / Connected / Needs attention. "Check again" button calls verify + config and updates domain_verified.
4. Remove domain button.
5. Show a friendly help note: "DNS changes can take up to 48 hours."
Never expose the Vercel token to the browser.
```
**Check:** connect a real domain you own and wait for "Connected".

**Prompt B: smart guided setup (free, makes DNS easy for non-technical clients)**
```
Upgrade the domain settings page into a guided "Connect your domain" wizard:
1. Provider detection (server only): use Node's dns module (dns.promises.resolveNs) to look up the domain's nameservers and map them to a provider in lib/domains/providers.ts: GoDaddy, Namecheap, Cloudflare, Squarespace Domains (formerly Google Domains), Wix, Bluehost, HostGator, Hostinger, IONOS, Network Solutions, Porkbun, Amazon Route 53, Vercel, plus "Other". Each provider entry has: name, logo, a link to its DNS management page, and 4–6 plain-English steps for adding an A record and a CNAME (e.g. "Log in to GoDaddy → My Products → next to your domain click DNS → Add New Record").
2. Wizard steps: (1) Enter domain → (2) "We detected your domain is managed by GoDaddy" (with a "Not right? Choose your provider" dropdown) → (3) provider-specific steps with the exact records to add and copy buttons on each value, and an "Open GoDaddy DNS settings" button → (4) "Waiting for your domain…" with a live status check.
3. Conflict check: look up existing A and CNAME records for the root and www (dns.promises.resolve4 / resolveCname). If old records point elsewhere (e.g. an old Wix or GoDaddy site), show a clear warning: "Delete this old record: A @ 23.x.x.x".
4. Automatic checking: while the wizard is open, check every 30 seconds (verify + config). Also add a Vercel cron job (vercel.json) that runs every 15 minutes, checks all sites where custom_domain is set and domain_verified is false, updates them, and emails the account owner "Your domain is live" when connected (Resend, if RESEND_API_KEY is set). Stop checking domains that have been pending for over 14 days and mark them "Needs attention".
5. Short help video slot per provider (optional URL field) and a "Send these instructions to my web person" button that emails the steps and records to any email address.
6. Rate-limit DNS lookups (max 20 per minute per user) and validate domains with zod before any lookup.
```

**Prompt C: "We'll do it for you" request**
```
Add a "Have us connect it for you" option in the domain wizard:
1. The client clicks it and sees provider-specific instructions for giving us SAFE delegated access (never their password): GoDaddy "Delegate Access", Namecheap "Share Access", Cloudflare "Invite member" with DNS-only permission, Squarespace "Add a domain manager", and for others "Add us as a user". Show our agency support email from agency_settings as the address to invite.
2. Table domain_requests (migration 0013; I run it by hand): id, site_id, domain, provider, status ('requested' | 'in_progress' | 'done' | 'needs_info'), notes, created_by, created_at. RLS: account members can create and read their own; super admin can read and update all.
3. Super admin dashboard: "Domain requests" list with status updates; the client sees the status on their domain page and gets an email when it is done.
4. Never store registrar passwords or ask for them anywhere in the UI. Show a note: "We will never ask for your password."
```

**Later (when you have about 10+ paying clients): one-click automatic setup with Entri**
```
Integrate Entri Connect (entri.com) for one-click DNS setup:
1. Add ENTRI_APPLICATION_ID and ENTRI_SECRET env vars. Create a server route that issues a short-lived Entri JWT for the logged-in user.
2. In the domain wizard, call Entri's checkDomain first; if automatic setup is supported, show a "Connect automatically" button that opens the Entri modal with the DNS records from Vercel (A for root, CNAME for www); otherwise fall back to the guided steps from Prompt B.
3. Listen for Entri's completion event and webhook, then run verify + config and update domain_verified.
4. Keep the guided setup and "We'll do it for you" options as fallbacks.
```

---

## Phase 9: Go live on Vercel

**Do these yourself:**
1. Push the repo to GitHub, then import it in Vercel. Add every env var from `.env.local` (with `ROOT_DOMAIN=sitomax.com`).
2. In Vercel → Domains, add `sitomax.com` and the wildcard `*.sitomax.com`. Wildcards need Vercel nameservers, so point your domain's nameservers to Vercel.
3. In Supabase → Authentication → URL Configuration, set the Site URL to `https://sitomax.com` and add `https://sitomax.com/**` as a redirect URL.

**Prompt (final review):**
```
Do a production readiness review: check every RLS policy against copilot-instructions.md, confirm the service role and Vercel token are never imported into client code, add loading and error states to dashboard pages, add sitemap.xml and robots.txt for tenant sites, and list anything still missing.
```

---

## Phase 10: AI website builder (Claude)

You can run this any time after Phase 5. It doesn't depend on domains or going live.

**Do this yourself first:**
1. Create an account at platform.claude.com, add billing, and set a **monthly spend limit** (e.g. $50) so costs can never surprise you.
2. Create an API key and add it to `.env.local` (and later to Vercel) as `ANTHROPIC_API_KEY=`. Never paste it anywhere else.
3. Optional, for photos: create a free Unsplash developer account and add `UNSPLASH_ACCESS_KEY=`.

**Prompt A: AI foundation, limits and credits**
```
Read .github/copilot-instructions.md. Add the AI foundation:
1. Install @anthropic-ai/sdk. Create lib/ai/client.ts (import "server-only"; reads ANTHROPIC_API_KEY; never imported by client components).
   Models (constants in lib/ai/models.ts so they are easy to change): "claude-sonnet-5-5" for site generation and large rewrites, "claude-haiku-5-5" for small edits.
2. Migration supabase/migrations/0011_ai_usage.sql (I run it by hand in the SQL Editor; 0006 is already used):
   - ai_usage: id, account_id, user_id, site_id, action ('generate_site' | 'edit_section' | 'rewrite_text'), model, input_tokens, output_tokens, cache_read_tokens, cost_usd numeric, created_at. RLS: account owners can read their own rows; super admin reads all; inserts only server-side with the admin client.
   - ai_limits: account_id pk, monthly_site_generations int default 1, monthly_edits int default 50, extra_credits int default 0. RLS: owners read their own; only super admin can update.
3. lib/ai/usage.ts: checkLimit(accountId, action) before every AI call and recordUsage(...) after, computing cost_usd from token counts (prices in a config object). Super admin has no limits.
4. Rate limit: max 10 AI requests per minute per user.
5. Dashboard: an "AI usage" card per client (used / limit this month), and for super admin a page with total AI cost per client per month.
```

Implemented foundation:
- Apply `supabase/migrations/0011_ai_usage.sql` after 0010. It seeds limits for
  existing accounts and initializes defaults for new ones. Owners can read
  account usage/limits; editors cannot read billing. Only the agency can edit
  limits; usage writes and reservations are service-role-only.
- All future AI features must use `requestAi` in `lib/ai/client.ts`, never call
  the SDK directly. It validates input, checks authenticated account/site access,
  reserves quota, makes one non-streaming request, then records actual tokens.
  Model IDs are in `lib/ai/models.ts`; agency-supplied USD-per-million rates are
  in `lib/ai/pricing.ts`. No model availability or provider rates are assumed
  verified. Unknown models, cache prices or incomplete cache breakdowns fail
  closed. Haiku uses the higher input AND output rates strictly above 100K prompt
  tokens; caching is disabled for Haiku because no cache rates were supplied.
- Set `ANTHROPIC_API_KEY` server-side. No key or SDK is exposed to client
  components. No live AI request is made by the dashboard or these tests.
- Included quotas reset at UTC calendar-month boundaries. Both edit actions
  share the monthly edit allowance. Credits belong to an account, never expire,
  and cost 10 per generation or 1 per edit/rewrite after the included allowance.
  Agency requests are recorded but do not consume client quotas or credits.
  The rolling 10-request/60-second per-user safety rate limit applies across all
  accounts, including agency requests and failed provider attempts.
- Quota/credit reservations use Postgres locks, not process-local counters.
  Confirmed provider rejections release quota and refund credits. Network
  timeouts and uncertain server failures keep their reservations held because
  generation may already have been billed. Successful ledger writes are
  idempotent. Accounting failures keep the reservation held and
  surface its request ID; numeric usage counters are logged without prompts or
  credentials so the agency can reconcile with `recordUsage` after recovery.
  Do not simply refund a completed, billed request. A process killed mid-call
  also leaves a pending reservation: verify provider billing before finalizing
  it via the service-only `finish_ai_request` function. Pending reservations do
  not expire automatically, avoiding unmetered retries.
- Sites shows account usage cards (owners and agency only). Agency **AI costs**
  selects a UTC month and aggregates recorded costs by client inside Postgres.
  Usage is assigned to the request's reservation month. Costs exclude pending
  requests until reconciled. These are estimates based on configured rates,
  not invoice totals or credit-pack prices.
- The site generator below uses this metered entry point. AI editor commands
  remain future work.

**Prompt B: "Build my site with AI" generator**
```
Build the AI site generator using the section design catalog (lib/sections/catalog.ts) and the block schemas:
1. Wizard (dashboard → New site → "Build with AI", and also available to account owners for their own site): business name, type, city/area, services (tags), what makes them different, style preference (Classic / Modern / let AI choose), colors (optional), phone, email, address, and a free-text "Describe your business" box.
2. Server action generateSite, 2 steps with Claude tool use (strict JSON schemas, never free-form HTML):
   Step 1, plan (Sonnet): returns { style, theme colors, fonts, pages: [{ slug, title, sections: [{ designId, purpose }] }], seo: {...} }. designId must be one of the catalog design IDs (pass the catalog's IDs, names and descriptions in the system prompt).
   Step 2, fill each page in parallel (Sonnet): for each section returns props that match that block's schema exactly. Give the model each block's field schema as the tool input_schema.
   Use prompt caching for the long, unchanging system prompt (block schemas + catalog + writing rules).
3. Writing rules in the system prompt: professional, specific and confident copy for a local business; no invented facts. Never invent reviews, ratings, license numbers, years in business or awards; use clearly marked placeholders like [Add a real customer review] instead. Write SEO titles under 60 characters and descriptions under 160.
4. Validate every AI response with zod against the block schemas; retry once with the validation errors if invalid; sanitize all rich text with the same DOMPurify rules as Phase 4b. If it still fails, fall back to the design's default props for that section.
5. Images: for each image field, search Unsplash with a query the AI provides (e.g. "plumber kitchen sink"), store the photo URL plus photographer credit (required by Unsplash), and set alt text. If no key is set, use placeholders.
6. Save everything as drafts (draft_data), never publish automatically. Stream progress to the UI with steps: "Planning your site…", "Designing Home…", "Writing Services…", "Finding photos…", then open the editor.
7. Record usage and enforce limits from Prompt A.
```

**Implemented site-generator setup and behavior**

- Apply `0012_ai_site_generator.sql` manually after `0011_ai_usage.sql`.
  This adds grouped accounting, draft-only themes and site-wide draft backups.
  Set server-only `ANTHROPIC_API_KEY`; optional `UNSPLASH_ACCESS_KEY` enables
  photo search. Never expose either key through a public environment variable.
- Agency: **Sites → Create site → Build with AI** selects a client and a
  subdomain. Owners: open their site, then **Build with AI**. Editors cannot
  generate or restore site-wide backups; database functions enforce this too.
  The replacement confirmation reads: “This will replace your current
  unpublished changes. You can restore them from version history.”
- Generates Home, About, Services and Contact. Other existing pages are left
  untouched. Existing page IDs, live content, SEO and live theme are preserved.
  Before replacement, one transaction backs up **all** current page drafts and
  the draft theme, then writes the generated drafts. **Version history: AI draft
  backups** on the site dashboard restores the whole backup without publishing.
  Editor **History** links there. Restore itself creates another backup; pages
  absent from a backup are cleared only if created by that generation, never
  deleted. Deleted original pages require agency recovery.
- `sites.draft_theme` is used in the editor and authenticated preview only.
  Publishing a page explicitly applies the pending site-wide theme. As with all
  site-wide theme changes, that publish changes the palette/fonts across the
  site. While an AI theme is pending, the theme inspector edits that draft.
- `generateSite` and the streamed POST transport use the same server-only
  pipeline. All planning/page/repair calls use Sonnet via `requestAi`.
  Strict tool schemas come from the actual Puck content fields (including nested
  arrays/objects); layout/design controls remain the catalog preset. Tool
  definitions and the long system prompt are stable across calls for prompt
  caching. Four pages fill in parallel, with at most ten calls total: plan plus
  four pages, each with one validation repair.
- Each invalid response gets one repair with Zod errors. Invalid sections then
  use the preset layout with clearly marked placeholder copy, not unverifiable
  sample claims. Two invalid plans stop without changing drafts. Rich text uses
  the same DOMPurify sanitizer as manual edits. Review factual accuracy, SEO,
  links and placeholders before publishing; AI output is not verified business
  evidence. Forms remain unconnected, with this limitation disclosed.
- One whole run consumes **one** included site generation or **10** shared
  credits, not one charge per page. Each actual provider call has a separate
  ledger row and counts toward the rolling 10/minute/user rate limit, including
  repairs and rejections. Agency remains quota/credit-exempt.
  An entirely rejected run refunds the reserved quota/credits. Any completed
  billable call retains the generation charge even if later validation or saving
  fails. Unknown call outcomes hold the reservation for agency reconciliation.
  After reconciling child requests, finalize the group with service-only
  `finish_ai_site_generation`; never simply refund a partly billed generation.
  New-site ledger rows are linked to the site once it is saved.
- The UI streams progress and opens the Home editor when saved. Missing photos
  and fallback sections produce persistent review notes in the editor. Keep the
  wizard open: there is no durable background-job queue or automatic retry.
  Interrupted sessions may leave held reservations; check drafts and provider
  billing before retrying. Both transports allow up to 300 seconds, subject to
  the hosting plan's execution limits. Long runs may time out and require agency
  reconciliation; photo work has a one-minute budget.
- Photo search uses generic image queries, hotlinks original Unsplash URLs and
  records each selected download. Photographer/source links include referral
  parameters. Attribution travels in each section's `photoCredits` metadata and
  is rendered by the shared shell, so copy/paste and saved designs keep it.
  Images get stock-photo alt text. No key, missing results or API errors leave
  placeholders; failures are disclosed. Staff portraits and partner logos are
  not substituted with stock imagery.
- Regression commands: `npx vitest run lib/ai`, `npx tsc --noEmit`,
  `npm run lint`, `npm run build`. Against an **isolated test database** with
  migrations applied, run `supabase/tests/ai_site_generator.sql` as the database
  owner. It rolls back its fixtures and checks group billing, exact rate limits,
  RLS, backup/restore (including approved embeds), draft/live isolation and
  explicit theme publishing. Tests never call live AI or a hosted database.

**Prompt C: AI assistant inside the editor**
```
Add an "AI" button to the editor:
1. Section actions (on the selected section): "Rewrite" (tone: professional / friendly / luxurious / shorter / longer), "Improve for SEO", and a free-text box ("Make this more upscale", "Add two more FAQs about water heaters"). Send only that section's props + its block schema + site business info; the model returns new props via tool use (Haiku for short rewrites, Sonnet for bigger changes). Show a preview with Accept / Try again / Cancel before applying.
2. Page action: "Add a section with AI" ("Add a pricing section with 3 plans") → the model picks a designId from the catalog and fills it; insert at the chosen position.
3. Inline text: when text is selected in a rich text field, show "Rewrite with AI" in the toolbar.
4. Everything goes through the same validation, sanitizing, limits and usage recording. Undo works for AI changes like any other edit.
```
**Check:** generate a site for a test business and check that it uses your designs, has no invented reviews or ratings, and opens as a draft. Then use "Rewrite → luxurious" on a hero, and check the AI usage card shows the cost.

---

## Later phases (after v1 works)
- Stripe billing per client (monthly hosting fee, AI credit packs)
- CRM / leads pipeline built on form_submissions
- Funnels, reviews, client reports
- Version history: keep past published_data snapshots so you can roll back