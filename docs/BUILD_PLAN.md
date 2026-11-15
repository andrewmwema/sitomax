# Build plan: v1 (paste each prompt into Copilot Chat)

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

## Phase 4b: Upscale blocks + rich text (run these 4 prompts in order)

**Before you start:** take screenshots of each section of the reference designs (hero, services, about, reviews, pricing, contact, footer) from the design canvas, in both styles: "Classic" (navy and brass) and "Modern" (bright and rounded). Attach the matching screenshots to each prompt in Copilot Chat. Commit after each prompt.

**Prompt A: design foundation**
```
Read .github/copilot-instructions.md. Create a shared design foundation for all Puck blocks so every site looks professional:

1. lib/theme/presets.ts: two style presets stored in sites.theme.style:
   - "classic": serif display headings (DM Serif Display) + Inter body, 4–6px corner radius, navy/brass style, small uppercase eyebrow labels with letter-spacing.
   - "modern": Plus Jakarta Sans 700/800 headings + Inter body, 16–24px radius, soft shadows, pill badges.
   Each preset sets CSS variables: --font-heading, --font-body, --radius-sm, --radius-lg, --shadow-card, --section-pad (96–112px desktop, 64px mobile), --container (1200px).
   Colors stay from the theme: --color-primary, --color-secondary, --color-bg, --color-text, plus computed --color-muted, --color-soft-bg, --color-border, --color-on-primary (white or dark, whichever passes WCAG 4.5:1 contrast).
2. Load fonts with next/font/google (no layout shift).
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

**Prompt C: rebuild the blocks with Classic + Modern variants**
```
Rebuild every block in components/blocks/ to match the attached reference screenshots, using only the shared primitives from components/blocks/ui/. Every block reads sites.theme.style and renders the Classic or Modern look automatically, plus these per-block options:
- Hero: layouts "split image", "centered", "full-width photo"; eyebrow, heading, rich subheading, 2 buttons, trust row (3 short check-mark items), optional floating card (e.g. "On-site in 60 min"), optional badge pill.
- Trust bar: 3–5 short credential items (rating, years, warranty, license).
- Services: 2 or 3 columns, card style "bordered grid" or "icon tiles", IconPicker icon, title, rich description, optional link.
- Image with text: image left/right, eyebrow, heading, rich text, optional numbered list (01, 02, 03).
- Testimonials: cards with star rating, quote, name, location. Show a hint in the editor: "Use real customer reviews only."
- Pricing: 2–4 plans, highlight one ("Most popular"), checklist items, button.
- Process / How it works: 3–4 numbered steps.
- FAQ: accordion using <details>, rich text answers.
- Service areas: pill list.
- Call to action: banner with heading, text, 2 buttons; backgrounds dark / primary / soft.
- Contact form: name, phone, email, service dropdown, message; Classic = white card on dark section, Modern = card on soft section.
- Gallery, Map, Logo strip, Footer (3 columns: business info, links, contact + hours).
Requirements for every block: responsive at 375px / 768px / 1280px, image fields use next/image with object-fit cover and required alt text, buttons and links have hover and keyboard focus states, text contrast at least 4.5:1, every field has a sensible professional default so a newly dropped block already looks finished.
```

**Prompt D: polish pass**
```
Do a visual polish pass on all blocks:
1. Section background control on every block (default / soft / dark / primary) so pages alternate backgrounds.
2. Consistent vertical rhythm: use --section-pad everywhere, no hard-coded margins.
3. Add subtle hover effects on cards (lift 2px + shadow in Modern, border color change in Classic).
4. Check mobile: nav collapses to a menu button, buttons go full width under 480px, no horizontal scroll.
5. Make the editor's block list show a small preview thumbnail for each block.
6. Update the 4 templates in templates/ to use the new blocks and variants, then list anything that still looks unfinished.
```
**Check:** create a new page, drop in each block, and switch the Style between Classic and Modern. Every block should look finished without editing. Bold, italic and bullets should work in body text.

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

---

## Phase 9: Go live on Vercel

**Do these yourself:**
1. Push the repo to GitHub, then import it in Vercel. Add every env var from `.env.local` (with `ROOT_DOMAIN=yourplatform.com`).
2. In Vercel → Domains, add `yourplatform.com` and the wildcard `*.yourplatform.com`. Wildcards need Vercel nameservers, so point your domain's nameservers to Vercel.
3. In Supabase → Authentication → URL Configuration, set the Site URL to `https://yourplatform.com` and add `https://yourplatform.com/**` as a redirect URL.

**Prompt (final review):**
```
Do a production readiness review: check every RLS policy against copilot-instructions.md, confirm the service role and Vercel token are never imported into client code, add loading and error states to dashboard pages, add sitemap.xml and robots.txt for tenant sites, and list anything still missing.
```

---

## Later phases (after v1 works)
- Stripe billing per client (monthly hosting fee)
- AI site generation: fill a template's copy from the business info using an AI API
- CRM / leads pipeline built on form_submissions
- Funnels, reviews, client reports
- Version history: keep past published_data snapshots so you can roll back