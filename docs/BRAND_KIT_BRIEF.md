# BRAND_KIT_BRIEF.md — Brand Kit & Logo Designer

## Goal
Give clients who have no branding a complete, professional brand kit in about two minutes — logo, colors, fonts, and ready-to-use files — and apply it automatically across SitoMax. Clients who already have a logo can upload it and get colors, fonts, and clean files extracted from it.

**How it works (division of labor)**
| Part | Tool | Job |
|---|---|---|
| Creative direction | **Claude (Sonnet)** | Reads business info; proposes style directions; writes Recraft prompts; picks accessible palettes and font pairings; names concepts |
| Logo symbol | **Recraft vector API** | Generates the icon/emblem as SVG |
| Wordmark & lockups | **SitoMax code** | Sets the business name in the chosen font (exact spelling, converted to vector outlines) and composes it with the symbol |
| Free option | **Claude + SitoMax templates** | Monogram/badge logos with no image API |
| Mockups & files | **SitoMax code** | Variants, favicon, social kit, business card, email signature, brand guide, ZIP |

Builds on what already exists: AI site generator (plan/fill), `sites.business`, the site theme system (`sites.draft_theme` / published theme, header logo), Media Picker / Supabase Storage, credits/`ai_usage`/allowances, Postmark, section library styling. Related briefs: SOCIAL_BRIEF.md (post templates), REVIEWS_BRIEF.md (review share images), CHAT_BRIEF.md (widget theming), BOOKING_BRIEF.md, PAYMENTS_BRIEF.md, SIGNING_BRIEF.md (branded pages/emails), GRADER_BRIEF.md (marketing copy only).

Work in phases. After EACH phase: build, lint, typecheck, tests, commit "Brand kit phase X: …", push, STOP and summarise. Migrations use the next free number; remind Andrew to run them in the Supabase SQL Editor.

**Before coding:** read Recraft's current API docs (vector generation models, image-input/style options, vectorize, pricing in API units, rate limits, output formats, content policy). Record confirmed models, endpoints, and per-call costs in `docs/BRAND_PROVIDER_NOTES.md`. Decide: call Recraft directly (preferred) or via an aggregator; keep it behind an interface either way.

---

## Cost controls (non-negotiable)
- **Hard cap: 20 symbol generations per brand kit** (every Recraft image counts: drafts, "more like this", refinements, HD finals). Show remaining count in the UI ("14 of 20 designs left").
- **Draft on the cheaper vector model; HD on the Pro vector model only for the chosen logo** (max 2 HD variations per kit, counted in the 20).
- **Per-account monthly cap** (config, default 2 kits/month on Starter, 4 on Growth, unlimited regenerations off) and a **platform daily budget** (config, default $50/day) with super-admin email alert at 80%.
- Vectorizing an uploaded logo: max 3 attempts per kit.
- Record every provider call in `ai_usage` with model, units, estimated cost, site/account, kit id.
- Expected cost per kit: ~$0.02–0.05 (monogram only), ~$0.45–0.80 typical drafts, worst case ≈ $6.25 at the cap. Keep model choices and prices in one config file.
- Super admin can grant extra generations per kit (logged).

---

## PHASE A — Data, providers, direction engine

### A1. Data (migration)
**`brand_kits`**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| site_id | uuid fk | (or account-level if the account shares branding across sites — follow existing tenancy; default per site) |
| status | text | `draft` \| `active` \| `archived` |
| source | text | `generated` \| `monogram` \| `uploaded` |
| business_name | text | as typed (exact) |
| tagline | text null | |
| industry, description | text | |
| style_keywords | text[] | e.g. ["modern","trustworthy"] |
| selected_concept_id | uuid null | |
| palette | jsonb | {primary, secondary, accent, neutrals[], text_on_primary, …} HEX |
| fonts | jsonb | {heading: {family, weights}, body: {family, weights}} Google Fonts |
| logo_assets | jsonb | storage paths per variant/format |
| generations_used | int | toward the 20 cap |
| generations_limit | int | default 20 (admin override) |
| applied_at | timestamptz null | |
| created_by | uuid | |
| created_at, updated_at | timestamptz | |

**`brand_concepts`**
`id, kit_id, kind ('symbol_logo' | 'monogram' | 'uploaded'), direction_name (e.g. "Modern & trustworthy"), prompt (Recraft prompt, server-only), provider_model, symbol_svg_path, layout ('horizontal' | 'stacked' | 'symbol_left' | 'badge'), palette jsonb, fonts jsonb, is_hd bool, parent_concept_id null, favorite bool, created_at`

**`brand_generations`** (audit + cap): `id, kit_id, concept_id null, provider, model, units, est_cost_cents, status, error, created_at`

Storage: private bucket `brand-assets/{site_id}/{kit_id}/…`; signed URLs for downloads; the active logo files copied to the public site asset location used by the theme.

RLS: account members read/write their site's kits; super admin all; provider prompts never sent to the browser.

### A2. `LogoProvider` interface
```ts
interface LogoProvider {
  generateSymbols(input: { prompt, style?, colors?: string[], count: number, quality: 'draft' | 'hd', referenceSvg?: string }): Promise<{ svg: string, units: number }[]>
  vectorize(input: { image: Buffer }): Promise<{ svg: string, units: number }>
}
```
`RecraftProvider` implements it. API key server-side only (`RECRAFT_API_KEY`). Timeouts, retries on transient errors (retries do NOT consume extra cap unless a billable image is returned), structured errors.

### A3. Direction engine (Claude Sonnet)
One server function `createBrandDirections(kitInput)` returning strict, schema-validated JSON:
- 4 **directions** (e.g. "Modern & trustworthy", "Bold & energetic", "Classic & established", "Friendly & local"), each with: Recraft symbol prompt(s) (abstract/iconic marks relevant to the industry; **no text, letters, or words in the symbol**; flat vector; limited colors; centered; no background), suggested layout, palette (5–7 colors), and a Google Fonts pairing from the curated list.
- Palette rules: primary must pass WCAG AA for white or near-black text; include a dark text color and light background; compute `text_on_primary`; avoid near-duplicates.
- Font rules: choose only from `config/brand-fonts.ts` (curated ~30 web-safe Google Font pairings with licenses OK for commercial use, tagged by style).
- **Safety rules in the prompt:** do not imitate or reference existing brands, trademarks, mascots, or logos; no famous characters; no religious or political symbols unless the business type clearly calls for it and the client requested it; no offensive imagery. Server-side blocklist check on business name/description for well-known brand names → show a friendly message.
- Count Claude calls in `ai_usage` (not toward the 20 cap).

### A4. Wordmark & lockup composer (SitoMax code)
- Render the **exact business name** (and optional tagline) in the chosen font using `opentype.js` (or similar) and **convert text to vector paths**, so SVGs don't depend on installed fonts.
- Layout templates: Horizontal (symbol left, name right), Stacked (symbol above name), Name only (wordmark), Symbol only, Badge (symbol + name in a shape). Each with spacing rules (clear space = height of a letter), optical alignment, auto letter-spacing for all-caps styles, and long-name handling (auto two-line or condensed weight).
- Recolor symbols to the palette (normalize SVG fills; strip scripts/external refs; sanitize all SVG with a strict allowlist before storing or rendering).

### A5. Free monogram engine (no image API)
- Claude picks initials (1–3 letters), shape (circle, rounded square, shield, hexagon, outlined ring), weight, and palette; SitoMax renders it from SVG templates + font outlines.
- Always offered first as "Simple & clean" options (4 variations) at near-zero cost.

### A6. Upload existing logo
- Accept PNG/JPG/SVG/PDF (first page). If raster or low-res, offer **"Make a sharp vector version"** via `vectorize` (counts as a generation, max 3).
- Extract palette (k-means on pixels, ignore background), suggest a font pairing (Claude), and generate the full asset package from the uploaded logo.

---

## PHASE B — Creation flow (client & super admin)

Entry points: onboarding (before AI site generation), Dashboard → **Brand** tab, AI site generator ("No logo? Create a brand kit first"), and super admin "Create brand kit for client".

### Steps
1. **Tell us about your business:** name (exact), optional tagline, industry (prefilled from `sites.business`), one-line description, style chips (Modern · Classic · Bold · Friendly · Luxury · Minimal · Playful), optional color preferences ("I like navy"), and colors to avoid.
2. **Choose a starting point:** "Design a logo for me" (AI) · "Simple monogram" (free) · "I already have a logo" (upload).
3. **Concept gallery:** 8 concepts (4 directions × 2) shown in the real business name on clean cards, plus 4 monograms. Each card: logo, direction name, palette dots, font name, ♡ favorite, **"More like this"** (generates 4 variations of that symbol/direction; counts toward cap), and "Choose".
4. **Customize (live studio):** layout switcher (Horizontal / Stacked / Badge / Wordmark / Symbol), font pair picker, palette editor (swap, regenerate palette, color picker with contrast warnings), name case and spacing, tagline on/off, light/dark preview, and **"Refine in HD"** (up to 2 Pro variations of the chosen symbol).
5. **Preview on real things:** live mockups — website header, business card (front/back), Instagram post, storefront sign, phone home-screen icon, email signature.
6. **Save & apply:** generates all deliverables (Phase C), applies to the site (Phase D), and shows the download page.

Always show "X of 20 designs left". When the cap is reached: disable generation buttons with a calm message and keep customization (fonts, colors, layouts) unlimited, since it costs nothing.

---

## PHASE C — Deliverables (generated server-side)

### Logo package
- Variants: **Horizontal, Stacked, Symbol only, Wordmark only, Badge** (if chosen).
- Color versions: **Full color, One-color (primary), Black, White (reversed on dark)**.
- Formats: **SVG** (outlined text), **PNG** transparent at 512 / 1024 / 2048 px wide (and 2x for headers), **PDF** (vector).
- File naming: `{business-slug}_logo_{variant}_{color}.{ext}`.

### Brand essentials
- **Palette sheet:** HEX, RGB, and approximate CMYK for each color, with roles (Primary, Secondary, Accent, Text, Background) and accessible text pairings.
- **Fonts:** heading/body families, weights, Google Fonts links, usage rules.
- **One-page brand guide** (dashboard page + PDF): logo variants, clear space, minimum sizes, do's and don'ts (no stretching, no recoloring outside palette, no busy backgrounds), colors, fonts, sample headline/body.

### Ready-to-use files
- **Website icons:** `favicon.ico` (16/32/48), PNG 192/512, Apple touch icon 180, maskable 512, SVG favicon.
- **Social kit** (PNG, correct current sizes, verify in docs at build time): Facebook profile + cover, Instagram profile, LinkedIn logo + banner, YouTube icon + banner, X profile + header, Google Business Profile logo + cover.
- **Business card PDF:** US 3.5 × 2 in, front and back, 0.125 in bleed, crop marks, CMYK-safe colors note, name/phone/email/website/address from `sites.business` (editable fields before export).
- **Email signature:** HTML (table-based, inline styles, hosted logo image) + copy button + plain-text version.
- **ZIP download** with folders: `/logos`, `/icons`, `/social`, `/print`, `/brand-guide`, `README.txt`.

Use `sharp`/`resvg` for SVG→PNG, `pdf-lib` (or similar) for PDFs, `png-to-ico` (or similar) for ICO. Generate in a background job with progress; cache outputs by kit version.

---

## PHASE D — Apply everywhere
- **Site theme:** set primary/secondary/accent/neutral colors and heading/body fonts in the site's draft theme (existing theme system), header logo (horizontal on desktop, symbol on mobile if the header supports it), favicon and app icons, default social share image (generated: logo on brand background). Show a before/after preview and **"Apply to my website"** (writes draft; client publishes as usual). Never overwrite a published theme without confirmation.
- **AI site generator:** if a kit is active, pass palette, fonts, logo, and style keywords into the plan/fill stages.
- **Shared brand tokens API:** `getBrand(siteId)` → logo URLs (variants), palette, fonts — used by CHAT widget theming, BOOKING pages, PAYMENTS checkout/invoices, SIGNING pages, REVIEWS landing/share images, SOCIAL post templates, Postmark email templates, and the monthly results email header.
- **Versioning:** each saved change creates a kit version; "Restore previous brand" available.

---

## Design spec — upscale, modern, polished (this is a selling feature)
Quality bar: **Looka, Brandmark, Canva Brand Kit, Linear, Stripe Dashboard** — but calmer and more premium. The studio should feel like working with a design agency. Reuse SitoMax dashboard tokens (same system as SOCIAL_BRIEF.md §13 and PAYMENTS_BRIEF.md design spec).

### Creation flow
- Full-screen focused experience with a slim top bar (SitoMax logo, step indicator "1 Business · 2 Start · 3 Concepts · 4 Customize · 5 Preview", Save & exit) and a sticky bottom action bar on mobile.
- Step 1: large, friendly form with style chips that show a tiny visual swatch per style; inline examples of good descriptions.
- **Generating state:** elegant, not a spinner — skeleton logo cards that shimmer and reveal one by one as results arrive, with short rotating copy ("Sketching your symbol…", "Pairing fonts…", "Balancing colors…").
- **Concept gallery:** responsive grid (1 col mobile, 2 tablet, 3–4 desktop) of large cards on a soft neutral canvas; each logo centered with generous padding; hover reveals actions; selected card gets an accent ring and check; direction name and palette dots under each logo; filter chips by direction; favorites tray.
- **Customize studio:** three-pane on desktop — left: controls (Layout, Fonts, Colors, Name & tagline, Refine in HD), center: large live logo canvas with light/dark/brand-color background toggles and zoom, right: mini mockups updating live. On mobile: canvas on top, controls in a bottom sheet with tabs.
- Font picker shows each pairing rendered with the real business name; palette editor shows swatches with role labels and live contrast badges (AA ✓ / ⚠).
- **Mockups:** photoreal-feeling but generated (CSS/SVG compositions): website header in a browser frame, business card with soft shadow and angle, Instagram post in a phone frame, storefront sign, app icon on a home screen, email signature in a mail client frame. Smooth crossfade when settings change.
- **Download page:** hero showing the final logo large on brand background, "Download all (ZIP)" primary button, grouped asset cards (Logos, Icons, Social, Print, Brand guide) with thumbnails and per-file download, "Apply to my website" card with before/after slider.

### Brand tab (dashboard)
- Brand overview card: logo, palette, fonts, last updated; actions: Edit brand, Download kit, View brand guide, Version history.
- Brand guide page rendered beautifully (document-style, printable) with sections and a sticky table of contents.

### Polish & accessibility
- Motion 150–250ms; card reveal stagger 40ms; canvas changes crossfade; respects `prefers-reduced-motion`.
- Generation counter as a subtle pill ("14 of 20 designs left"), amber at ≤ 5, with a tooltip explaining limits.
- Empty, loading, error states with plain-English messages ("We couldn't create designs right now. Your remaining designs weren't used. Try again.").
- WCAG AA, keyboard navigation through cards and controls, ARIA labels, focus management in the studio; dark mode.
- Breakpoints tested at 375 / 768 / 1280 / 1440px.

### Quality gate (before marking done)
- Run the full flow for 5 sample businesses (plumber, salon, bakery, law office, church) on both the monogram path and AI path, plus one upload; save screenshots of every step and the download page at 375px and 1440px (light + dark) to `docs/screenshots/brand-kit/`.
- Verify every exported file opens correctly (SVG in browser, PNG transparency, PDF print size/bleed, ICO in browser tab, email signature in Gmail/Outlook web).
- Self-review against this spec; fix gaps before handing off.

---

## Legal & safety notes (show in UI where relevant)
- Under the concept gallery and in the brand guide: "Before printing signs or registering a trademark, check that your logo isn't similar to an existing mark in your industry (e.g. a USPTO search) and consult an attorney for trademark registration. AI-generated artwork may have limited copyright protection." Not legal advice.
- Refuse requests to recreate or resemble known brands/logos; sanitize all SVGs; never expose provider prompts or keys.

## Plans & gating (config, not hard-coded)
**The brand kit is included in the subscription — never billed monthly on its own.** Monthly kit limits only control how many kits an account can create (cost control), not billing.
- Every plan: monogram kit, upload-your-logo kit, full deliverables, apply to site.
- Growth+: AI symbol logos (20-generation cap per kit), HD refine.
- Monthly kit limits per plan; super admin overrides.

---

## PHASE E — One-time purchases & standalone kit

All one-time purchases are charged to **SitoMax's own Stripe account** (platform billing, Stripe Checkout in `payment` mode) — **not** Stripe Connect (Connect is only for clients collecting money from their customers; see PAYMENTS_BRIEF.md). Prices, names, and what's included live in one config file (`config/brand-offers.ts`) with Stripe Price IDs in env/config so Andrew can change them without code changes.

### E1. Data (migration)
**`brand_orders`**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| kit_id | uuid fk null | |
| account_id / site_id | uuid null | null for guest standalone buyers until they sign up |
| buyer_email, buyer_name | text | |
| offer | text | `pro_logo` \| `extra_designs` \| `rebrand` \| `standalone_kit` \| `standalone_kit_ai` |
| amount_cents, currency | int, text | |
| stripe_checkout_session_id, stripe_payment_intent_id | text | |
| status | text | `pending` \| `paid` \| `in_progress` \| `delivered` \| `refunded` \| `canceled` |
| fulfillment | jsonb | e.g. revisions used, designer notes, delivered file paths |
| created_at, paid_at, delivered_at | timestamptz | |

Webhook: reuse the existing platform Stripe webhook (subscription billing) or add a dedicated route; handle `checkout.session.completed`, `charge.refunded`. Idempotent by event id.

### E2. Offers (defaults are placeholders; Andrew sets final prices)
1. **Extra designs pack** — default $29 for +20 AI symbol generations on one kit (raises `generations_limit` by 20; logged). Shown when the counter reaches 0: "Need more options? Get 20 more designs."
2. **Rebrand** — default $49: starts a fresh kit after the account's included kits for the period are used (new kit with a full 20-generation allowance), keeping the old kit in version history.
3. **Pro logo — designer refinement** — default $299 (configurable $199–499): the client picks a concept → checkout → creates an order and a **task for Andrew** (super admin queue + Postmark email + entry in the Leads inbox for SitoMax's own account) with the concept, palette, fonts, business info, and client notes attached.
   - **Fulfillment flow (super admin):** order queue (New · In progress · Awaiting client · Delivered) → upload refined SVG/PNG/PDF files → "Send for review" → client sees a review page with the refined logo, can **Approve** or **Request changes** (default 2 revision rounds, configurable) → on approval the refined logo becomes the kit's logo and all deliverables regenerate automatically.
   - Client-facing status card on the Brand tab with timeline (Ordered → Designer working → Ready for review → Delivered) and expected turnaround (config, default "3–5 business days").
4. **Standalone brand kit for non-subscribers** (on the marketing site sitomax.com):
   - **Brand Kit (monogram)** — default $49; **Brand Kit with AI logo** — default $99 (20-generation cap applies).
   - Flow: landing page `/brand-kit` → business info + style → **free preview** (watermarked, low-res concepts; generation counts toward the cap and a per-IP/day limit; Turnstile required, reuse grader setup) → checkout (email captured) → full studio and deliverables unlocked → ZIP download and emailed link.
   - Creates a lightweight buyer account (email + password set via emailed link) scoped to their brand kit only — no website until they subscribe.
   - Every buyer becomes a lead in SitoMax's own Leads inbox (source "Brand Kit"), with an upsell sequence (Postmark broadcast stream, consent required): "Your brand is ready — get a website that uses it, launched in 7 days." If they subscribe, link the kit to the new site and apply it automatically (and optionally credit the kit price toward the setup fee — config flag).
   - Watermark previews server-side (never send unwatermarked files before payment); unlock only after the webhook confirms payment.
   - Abuse controls: rate limits, Turnstile, max 2 free preview kits per email/IP per day, daily platform budget (shared with the cost controls above).

### E3. Ownership & cancellation policy (show in UI and terms)
- **Clients own the logo files they download.** If they cancel their SitoMax subscription, they keep their files: the Brand tab remains downloadable for 90 days after cancellation (read-only), and a final ZIP is emailed at cancellation.
- What stops on cancellation: applying/syncing the brand across SitoMax features, generating new designs, and Pro logo revisions.
- Standalone buyers keep permanent access to their kit downloads.
- Show this in plain language on the download page: "These files are yours to keep and use anywhere."

### E4. Design (same premium spec)
- Offer cards match the studio's design language: clean cards with a small preview, price, what's included, and one primary button; no aggressive upsell banners.
- Checkout uses Stripe Checkout with SitoMax branding; success returns to a branded confirmation (animated check, "What happens next").
- Standalone landing page: premium hero ("Your logo and brand kit in minutes"), example kits gallery, what's included grid, pricing cards, FAQ (ownership, trademark note, refunds), and testimonials only if real (never fabricated).
- Pro logo review page: large logo on brand background, side-by-side "Original concept → Refined", revision notes thread, Approve / Request changes buttons.

---

## Acceptance criteria
- [ ] `docs/BRAND_PROVIDER_NOTES.md` documents confirmed Recraft models, endpoints, units, and costs.
- [ ] Hard cap of 20 generations per kit enforced server-side (concurrency-safe), with UI counter, admin override, monthly limits, daily platform budget alert, and `ai_usage` logging.
- [ ] Claude direction engine returns schema-valid directions with accessible palettes and curated font pairings; safety rules and brand-name blocklist work.
- [ ] Wordmarks use exact business names converted to outlines; lockups (horizontal, stacked, wordmark, symbol, badge) look balanced for short and long names.
- [ ] Monogram path works with no image API calls; upload path extracts palette, suggests fonts, and vectorizes (max 3).
- [ ] Creation flow (business → start → concepts → customize → preview → save) works for clients and super admin, including "More like this" and "Refine in HD".
- [ ] All deliverables generate correctly (logo variants/colors/formats, palette sheet, fonts, brand guide PDF/page, icons, social kit, business card PDF with bleed, email signature, ZIP).
- [ ] Apply-to-site updates the draft theme, header logo, favicon, and share image with before/after preview; `getBrand(siteId)` is used by the other features' theming.
- [ ] Version history and restore work.
- [ ] One-time purchases use SitoMax's own Stripe account (not Connect) with prices from config; webhook unlocks are idempotent.
- [ ] Extra designs pack raises the cap by 20; Rebrand starts a fresh kit; both logged.
- [ ] Pro logo order creates a super-admin task + Leads inbox entry; fulfillment queue, upload, client review with approve/request changes (revision limit), and automatic regeneration of deliverables on approval work.
- [ ] Standalone kit on sitomax.com: watermarked free preview, Turnstile and rate limits, checkout, unlock after payment, buyer account, Leads inbox entry, consent-based upsell sequence, and auto-apply when the buyer subscribes.
- [ ] Ownership policy shown in UI; downloads remain available read-only for 90 days after cancellation and a final ZIP is emailed.
- [ ] Design spec met; quality gate completed with screenshots and file checks.