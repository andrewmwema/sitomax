# Section Library Brief — Phase 0: Premium Section Upgrade

**Phase order:** Phase 0 (this brief) → Phase 1 `TEMPLATES_BRIEF.md` → Phase 2 `AI_BUILDER_BRIEF.md`
**Branch:** `feature/section-library-v2`

## Goal

Every section in the SitoMax section library (Build → Section library → Designed) should look premium, modern and polished, and should be built to convert visitors into leads.

Reference bar for polish: fieldsnapp.com, easymoneytracking.com, dashclicks.com. Match their quality, not their layouts, copy or assets.

This phase comes **before** the premium templates (Phase 1) and AI building (Phase 2). Those phases are assembled from these sections, so quality and consistency here matter more than quantity.

## Step 1 — Inspect and audit (report before changing code)

- Map how sections are defined, rendered, previewed (hover-to-try), thumbnailed and saved: files, block schema, Supabase tables, and how client sites reference a variant.
- Produce an audit table of **every** existing variant across all categories (Hero, Services, About, Text & Image, Text blocks, Stats, Logos, Team, Testimonials, Pricing, FAQ, Blog, Call to action, Contact, Gallery, Portfolio, and any others). Score each 1–5 on visual polish, mobile quality, theme-token use, conversion strength and editability, with a one-line fix plan for each.
- Flag anything that would break live client sites if changed.

## Step 2 — Protect existing client sites (critical)

Enhancing a variant must never break or unexpectedly restyle a client's live site.

- Keep every block's content schema backward-compatible. Field additions must be optional with sensible defaults. Never rename or remove fields without a migration that maps old content to new.
- Choose and explain one approach:
  - **(a)** Existing sites get the enhanced design automatically because content maps cleanly.
  - **(b)** Variants are versioned, so existing sites keep v1 until they opt in to v2.
  - Default to (a) when the change is visual and content-safe, and use (b) for structural changes.
- Before and after the work, render a sample of existing client sites (or seeded test sites using every variant) and confirm nothing breaks.

## Step 3 — Design system foundation

Build or strengthen a theme-token layer that every section uses. No hard-coded colors, fonts or spacing inside sections.

- **Tokens:** primary/secondary/accent colors, neutrals, surface/background levels, text colors, heading and body font pairing, type scale, radius, shadow levels, spacing scale, section padding (compact / normal / spacious), container widths, button styles (primary, secondary, ghost) and states.
- Light and dark section backgrounds, with automatic text-color handling for WCAG AA contrast.
- 6–8 curated theme presets (e.g. Modern Navy, Warm Editorial, Bold Mono, Fresh Green, Luxury Black & Gold, Soft Neutral), tested against every section.
- **Typography:** fluid type sizes (`clamp`), tight letter-spacing on large headings, comfortable line lengths (about 60–75 characters for body text), clear eyebrow/headline/subhead hierarchy.
- **Shared row options** on every section, editable in the editor: background (color, gradient, image with overlay, subtle pattern), padding size, width, divider style, entrance animation (none, fade, rise; respects `prefers-reduced-motion`), and hide on mobile/desktop.

## Step 4 — Premium visual standard (every variant)

- Generous whitespace and a consistent vertical rhythm.
- Real imagery or original HTML/SVG UI mockups. No gray placeholder boxes or generic clip-art icons. Use one consistent icon set (e.g. Lucide) everywhere.
- Subtle depth: soft layered shadows, thin borders, refined radius, tasteful gradients. No heavy drop shadows or dated effects.
- Hover and focus states on all interactive elements, with smooth 150–250ms transitions.
- **Mobile-first:** test at 375, 768, 1280 and 1440px. Stack layouts intelligently, reordering where needed. Tap targets 44px or larger. No horizontal scroll.
- **Accessibility:** semantic HTML, one H1 per page, alt text fields, visible focus, AA contrast. Never disable pinch zoom.
- **Performance:** optimized responsive images, lazy loading below the fold, no layout shift, minimal JS per section.
- Default sample content is niche-neutral and premium, suited to services, professional and product businesses rather than one industry.

## Step 5 — Conversion standard (built into the sections)

- Every section that can carry a CTA supports primary and secondary buttons with an editable label and an action: link, phone (`tel:`), email, scroll-to-section or form popup.
- **Heroes:** benefit-led headline, supporting subhead, primary CTA visible above the fold on mobile, optional trust line under the CTA (rating, "No obligation," response time, credentials).
- **Trust near action:** optional rating/review badge, client logos or a short proof point on hero, pricing, CTA and contact sections.
- **Forms:** short by default (name, email/phone, message), clear labels, inline validation, success state, spam protection, optional multi-step for longer forms. Connect to the existing forms system.
- **Mobile conversion:** optional sticky bottom bar (Call / Book / Get a quote) and click-to-call phone in the header.
- Track CTA clicks and form submissions through the existing analytics system so clients can see what converts.
- No dark patterns (fake countdown timers, fake scarcity, fake reviews).

## Step 6 — Enhance every existing variant

Apply Steps 3–5 to every variant from the audit.

| Category | Expectations |
| --- | --- |
| Hero | Polished versions of all existing variants (split with image, centered with badge, photo overlay, video background, form hero, etc.), with proper overlay gradients, trust line and mobile layouts |
| Services | Card grids with icon/image, hover lift and "Learn more" links; a feature-list layout; an alternating image/text layout |
| About / Text & Image / Text blocks | Editorial layouts with strong type, pull quotes, image treatments and stat callouts |
| Stats | Animated count-up (reduced-motion safe), clean dividers, light and dark versions |
| Logos | Static grid plus an infinite-scroll marquee, grayscale-to-color hover |
| Team | Refined portrait cards, roles and social links, consistent image cropping |
| Testimonials | Photo, name, role/company, star rating, featured quote, carousel and grid; clearly editable so clients use real reviews |
| Pricing | Highlighted "most popular" tier, monthly/annual toggle, feature checklists, CTA per plan, reassurance line |
| FAQ | Smooth accordion, two-column option, schema.org FAQ markup |
| Blog | Card layouts with image, category, date and read time |
| Call to action | Banner, split with image and full-bleed versions, each with a trust line |
| Contact | Form plus details, map embed option, hours, click-to-call |
| Gallery / Portfolio | Masonry, uniform grid and lightbox; captions; filter tabs where useful |
| Header / Footer | Sticky header with shrink-on-scroll, transparent-over-hero option, mobile drawer, CTA button; multi-column footer with newsletter option, legal and social links (if they live in the library) |

## Step 7 — Add missing section types (needed by Phase 1 templates)

Add these as new, fully editable variants in the right categories:

1. **Product/demo hero:** split layout with an original HTML/SVG device mockup (laptop + phone) that users can swap for a screenshot.
2. **Editorial centered hero:** large serif display headline, minimal subhead, dual CTA.
3. **Oversized-type hero:** bold typographic statement for agencies and creatives.
4. **Process / How it works:** 3–5 numbered steps, horizontal and vertical versions with visuals.
5. **Audience paths:** "Find the right fit" cards linking to audience or service pages.
6. **Trust/rating bar:** review-platform style badges, rating and short proof points.
7. **Feature showcase:** alternating rows with large visuals and benefit bullets.
8. **Comparison table:** "Us vs. typical" or plan comparison.
9. **Asymmetric portfolio grid:** large and small project tiles with hover reveal.
10. **Case study blocks:** challenge/approach/results, full-bleed image, results metrics, next-project link.
11. **Report/document preview:** a sample-deliverable section (e.g. report or estimate preview).
12. **Mobile sticky CTA bar:** a site-level setting.

## Step 8 — Library and editor experience

- Regenerate all section thumbnails from the real rendered components, so thumbnails always match what gets inserted and look polished with the default theme.
- Keep hover-to-try preview working for all variants. Category counts update automatically.
- Every text, image, button and list item is editable in the existing editor. Repeatable items (cards, steps, logos, FAQs, tiers) can be added, removed and reordered.
- Add a short description and best-for tags to each variant (e.g. "Best for service businesses — strong above-the-fold CTA").
- Give every section clean, typed metadata (editable fields, limits, image slots and aspect ratios) so Phase 2 AI can fill sections reliably.

## Step 9 — Acceptance test (verify before reporting done)

1. Open the section library. Every category shows polished, accurate thumbnails, and hover-to-try works.
2. Insert every variant into a test page, edit text, images, buttons and repeatable items, then save, reload and confirm everything persisted.
3. Switch through all theme presets. Every section stays polished and AA-contrast compliant.
4. Check every section at 375, 768, 1280 and 1440px with no layout breaks.
5. Open seeded test sites built with the **old** variants. They still render correctly (enhanced or unchanged per the Step 2 approach), with no lost content.
6. Test CTA actions (link, `tel:`, scroll, form popup), form submission and analytics events.
7. Run Lighthouse on a page using many sections: performance and accessibility 90+.
8. Run lint, type-check and tests, and fix anything broken.

## Step 10 — Report back with

- The audit table with before/after scores.
- The backward-compatibility approach and any migrations.
- New variants added, and the per-category counts now.
- Anything unfinished or compromised.
- Exact steps to review the work in Codespaces: commands, URL/port, test logins, and where to see before/after. Ideally a `/dev/sections` showcase page that renders every variant with a theme switcher and viewport toggle.

Commit by category in logical chunks and open a PR when done.

**Tip:** if the work is too large for one pass, do Steps 1–5 first, then pause for review of `/dev/sections` before working through the categories.