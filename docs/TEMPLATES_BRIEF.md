# Templates Brief — Phase 1: Premium Website Templates

**Phase order:** Phase 0 `SECTION_LIBRARY_BRIEF.md` → Phase 1 (this brief) → Phase 2 `AI_BUILDER_BRIEF.md`
**Branch:** `feature/premium-templates-v1`
**Prerequisite:** Phase 0 merged.

## Context

SitoMax (repo: `white-label-multi-tenant-website-platform`) is a multi-tenant website builder on Vercel + Supabase. Clients edit their own sites, and the super admin builds sites for clients. Phase 0 upgraded the section library and added theme tokens and presets.

This phase builds three premium master templates and makes them selectable under **Use SitoMax Designs**. AI generation and automatic template selection come in Phase 2. Do not build them now, but store each template's sections and content in a structured way an AI can fill later.

## Step 1 — Inspect before building

Before writing code, study the repo and write a short summary covering:

- How sites, pages, sections/blocks and templates are stored (Supabase tables, JSON schema, RLS policies).
- How the existing editor renders and saves blocks.
- The Phase 0 section library, theme tokens and presets.
- Any existing template system and the Use SitoMax Designs entry point.
- How site preview and publishing work.

Reuse these systems. Don't build a parallel editor, renderer or template system.

**Assemble the three templates from the Phase 0 section library and theme presets.** Only create new section variants if a design truly requires one, and add any you create to the library so clients can use them too. If something blocks the plan, report it and propose the smallest fix.

## Step 2 — Design bar

Match the polish of fieldsnapp.com, easymoneytracking.com and dashclicks.com without copying their layouts, copy, branding or assets. Follow the Phase 0 visual and conversion standards. In addition, each template must have:

- Short benefit-led headlines with one supporting line, in a consistent rhythm.
- One primary action repeated in the header, hero and closing section, with a quieter secondary action.
- Social proof (ratings, logos, testimonials, stats) placed close to the CTAs.
- Content organized by audience or use case where it fits.
- A full footer: grouped link columns, legal links, social links, short brand line.
- Its own theme preset (colors, font pairing, radius, spacing) applied to every page.
- Mobile-first layouts tested at 375, 768, 1280 and 1440px, AA contrast, pinch zoom never disabled.
- Lighthouse 90+ for performance and accessibility on the home page.
- Free-license photos (e.g. Unsplash/Pexels) stored in the project or Supabase storage, never hotlinked. Product mockups built as original HTML/SVG UI. No real brand logos; use invented client logos.

## Step 3 — The three templates

Each one is a complete, client-ready website: a coherent fictional business, finished copy (no lorem ipsum), real imagery, working navigation between pages, and a working contact/booking form using the platform's existing form system.

### 1. Showcase — product or process-led

**Sample business:** Northline Inspections, a property inspection company with digital reports.

- **Home:** split product/demo hero (headline, subhead and two CTAs on the left; an original HTML/SVG mockup of an inspection report on a laptop and phone on the right); trust/rating bar; "How it works" walkthrough (3–4 numbered steps with visuals); feature showcase; stats band; testimonials; pricing or packages; FAQ; closing "Book an inspection" CTA.
- **Interior pages:** Services; Sample Report (a realistic report page using the report preview section: findings, photos, summary); About; Contact/Book.
- **Feel:** confident, techy, clean. Dark or deep-navy hero with a bright accent.

### 2. Clarity — light and spacious, several services or audiences

**Sample business:** Harbor & Pine Advisors, a financial and bookkeeping firm serving individuals, families and small businesses.

- **Home:** editorial centered hero (serif display headline paired with a clean sans); audience paths ("Find the right path"); services overview; approach/process; trust and credentials; testimonials; resources teaser; closing consultation CTA.
- **Interior pages:** Services index; one Service Detail page (e.g. Small Business Bookkeeping: who it's for, what's included, process, FAQ, CTA); one Audience page (e.g. For Families); About/Team; Contact.
- **Feel:** light, airy, warm neutrals, lots of whitespace, editorial.

### 3. Studio — portfolio-led, agencies and creatives

**Sample business:** Forma Studio, a brand and web design agency.

- **Home:** oversized-type hero; asymmetric portfolio grid with large project images and hover reveals; capabilities list; client logo row; short studio philosophy; testimonial; "Start a project" CTA.
- **Interior pages:** Work index (filterable or grouped); one Project Case Study (case study blocks: challenge, approach, full-bleed imagery, results metrics, next-project link); About/Studio; Contact with a project inquiry form (budget, timeline, services checkboxes).
- **Feel:** high-contrast, gallery-like, expressive type, minimal chrome.

## Step 4 — Workflow

Build this flow for **both** a self-service client and the super admin building for a client account:

**Browse designs → Preview full template → Use this design → Editable copy opens in the existing SitoMax editor**

- **Browse:** a gallery under Use SitoMax Designs with a thumbnail, name, one-line description and best-for tags per template.
- **Preview:** the full multi-page template, navigable, with a desktop/mobile toggle, plus "Use this design" and "Back to designs."
- **Use this design:** deep-copy the master into a **new independent site** owned by the chosen client account (all pages, sections, content, theme tokens, image references, form configs). Name it sensibly and allow renaming.
- Master templates are read-only to clients. Editing a client copy must never change the master or other clients' sites. Enforce this in Supabase (separate rows, RLS), not only in the UI.
- The super admin can choose which client account receives the new site.
- Seed the three masters with an idempotent seed script/migration so they can be re-created in any environment.

## Step 5 — Acceptance test (verify before reporting done)

For **each** template, as both a client user and the super admin:

1. Browse designs and open the full preview. Navigate every page in desktop and mobile view.
2. Click "Use this design" and confirm a new site appears in the editor.
3. Edit a headline, a paragraph, a button label and link, and replace an image.
4. Save, reload the browser and reopen the site. Changes persist.
5. Preview the edited site on desktop and mobile.
6. Open the master template's preview again and confirm it is unchanged.
7. Create a second copy of the same template and confirm it is independent of the first.

Also run lint, type-check and existing tests, and fix anything broken.

## Step 6 — Report back with

- What was built and changed (files, migrations, any new section variants added to the library).
- Anything unfinished or compromised.
- Exact step-by-step instructions for reviewing all three designs in Codespaces: commands to install, migrate, seed and run; which forwarded port/URL to open; test login credentials for a client account and the super admin; and the click path through the acceptance test.

Commit in logical chunks with clear messages and open a PR when done.