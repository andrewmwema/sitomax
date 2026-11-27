# GRADER_BRIEF.md — Free Website Grader (sitomax.com lead magnet)

## Goal
A free "How good is your website?" tool on the **marketing site (sitomax.com)**. A visitor enters a URL, watches a live scan, sees a score + top 3 issues for free, and gives their email to unlock the full report, a PDF, and a fix plan. Every email captured becomes a lead in **SitoMax's own Leads inbox** (super-admin account) so Andrew can follow up, and the report funnels to "Let SitoMax fix this."

**Where it lives:** pages on sitomax.com; API routes in whichever app serves sitomax.com (follow existing conventions). Data in the existing Supabase project. Emails via the existing `lib/email` (Postmark). AI via the existing Claude setup.

Work in phases. After EACH phase: build, lint, typecheck, tests, commit "Grader phase X: …", push, STOP and summarise. Migrations use the next free number; remind Andrew to run them in the Supabase SQL Editor.

**Honesty rule:** every number and finding must come from an actual check. If a check fails or times out, show "Couldn't check" for that item and exclude it from the score; never guess.

---

## Environment variables
| var | required | notes |
|---|---|---|
| `PAGESPEED_API_KEY` | recommended | Free Google Cloud key, no billing needed. If missing, call PSI without a key (low shared quota) and degrade gracefully. |
| `GOOGLE_PLACES_API_KEY` | optional | **Feature flag:** Places checks run only if set. Off for v1. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | yes | Cloudflare Turnstile (free) bot protection. |
| `ANTHROPIC_API_KEY` | yes (existing) | AI summary. |
| Postmark vars | yes (existing) | Report email + follow-ups. |
| `GRADER_LEADS_ACCOUNT_ID` / site id | yes | Which SitoMax account/site receives grader leads in the Leads inbox. |

Add all to `.env.example` and remind Andrew to set them in Vercel.

---

## PHASE A — Scan engine + data

### A1. Data (migration)
**`grader_reports`**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| slug | text unique | shareable, e.g. `joes-plumbing-x7k2` |
| url_input, final_url, domain | text | normalized; `final_url` after redirects |
| business_name, city | text null | optional inputs |
| has_google_profile | text null | `yes` \| `no` \| `not_sure` (self-reported) |
| google_maps_url | text null | optional, self-reported |
| status | text | `queued` \| `running` \| `complete` \| `failed` |
| progress | jsonb | per-check status for the live progress UI |
| results | jsonb | raw check results |
| scores | jsonb | overall + per category |
| ai_summary | jsonb | summary, top issues, fix plan |
| screenshot_url | text null | Supabase Storage |
| unlocked | bool | email captured |
| lead_id | uuid null | link to Leads inbox |
| ip_hash, user_agent | text | rate limiting/abuse (hash IPs) |
| created_at, completed_at | timestamptz | |

**`grader_unlocks`**: `id, report_id, name, email, phone null, consent_marketing bool, created_at`.

RLS: no public table access; all reads/writes through server routes. Super admin can read everything.

### A2. Safe fetching (critical)
- Normalize input (add https://, strip tracking params, lowercase host).
- **SSRF protection:** resolve DNS and reject private/loopback/link-local/metadata IP ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7, etc.), non-http(s) schemes, and non-standard ports. Re-check after every redirect. Max 5 redirects.
- Timeouts: 10s per fetch; max HTML size 3MB; realistic User-Agent identifying "SitoMax Website Grader".
- Respect obvious blocks: if the site returns 403/429 to our fetch, mark HTML-based checks as "Couldn't check" and still run PageSpeed.

### A3. Checks
Run in parallel where possible; update `progress` as each completes. Each check returns `{ id, category, status: pass|warn|fail|unknown, value, detail, fix }`.

**Speed (PageSpeed Insights API, mobile + desktop)**
- Performance score (mobile, desktop), LCP, CLS, INP/TBT, total page weight.
- Store the PSI final screenshot (`final-screenshot` audit) to Storage for the report header.

**Mobile**
- Viewport meta present; PSI mobile-friendliness signals (tap targets, font sizes) where available; horizontal overflow hints.

**SEO**
- Title present + length (30–60 chars), meta description present + length (70–160), exactly one H1, heading structure, image alt coverage %, canonical tag, `robots` meta not noindex, robots.txt reachable, sitemap.xml reachable/declared, Open Graph tags, structured data present (JSON-LD LocalBusiness/Organization), PSI SEO score.

**Security & trust**
- HTTPS enforced (http → https redirect), valid certificate (fetch succeeds over TLS), mixed content hints from PSI, privacy policy link present, copyright year current or recent (flag if ≥ 2 years old).

**Lead capture (conversion)**
- Click-to-call (`tel:` link) present, visible phone number, contact form present (`<form>` with email/phone fields) or contact page link, CTA above the fold (heuristic: button/link with action words in the first screen of HTML order), booking/quote link, email link.

**Local presence**
- Address visible on the page (heuristic), hours visible, Google Maps link/embed present, reviews/testimonials section present.
- Self-reported Google profile: `no` → fail ("You're invisible in Google Maps"); `not_sure` → warn; `yes` → pass (unverified, labeled as such).
- **Places checks (only if `GOOGLE_PLACES_API_KEY` set):** find the business by name + city (or Maps URL), report rating, review count, and whether the phone/address on the site match Google. Behind a single `isPlacesEnabled()` flag; the UI hides these rows when off.

**Social & content**
- Links to Facebook/Instagram/LinkedIn/etc., blog/news section present, most recent post date if detectable.

**Accessibility**
- PSI accessibility score, image alt coverage, color contrast issues from PSI, `lang` attribute.

### A4. Scoring
- Category scores 0–100 from their checks (pass = full, warn = half, fail = 0; `unknown` excluded).
- Overall score = weighted average: Speed 20, Mobile 15, SEO 20, Security & trust 10, Lead capture 20, Local presence 10, Social & content 5. Re-normalize if a category is entirely unknown.
- Letter grade: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60.
- Keep weights in one config file.

### A5. AI summary (Claude)
- Input: the structured results only (no raw HTML beyond the title/meta/H1 text).
- Output (strict JSON schema, validated): `headline` (one sentence), `summary` (3–4 sentences, plain English, business-owner tone), `top_issues` (3, ranked by business impact, each with `why_it_matters` and `fix`), `fix_plan` (5–8 ordered steps), `sitomax_pitch` (2 sentences on how SitoMax fixes these, no exaggeration).
- Prompt rules: only reference findings present in the data; no invented statistics; if citing a general fact (e.g., slow sites lose visitors), phrase it generally without specific percentages; never insult the business.
- Use a fast/cheap model; record usage.

### A6. Job flow
- `POST /api/grader/scan` (Turnstile-verified) → validates URL, applies rate limits, checks cache, creates report (`queued`), triggers processing, returns `{ slug }`.
- Processing runs server-side within Vercel function limits (set `maxDuration` appropriately); if PSI is slow, run mobile and desktop in parallel. If processing can't finish in one invocation, split into steps persisted in `progress`.
- `GET /api/grader/report/{slug}` → status + progress + **teaser fields only** unless `unlocked`.
- **Cache:** if the same `final_url` was scanned in the last 24 hours, reuse its results (new report row pointing to the same results, so each visitor gets their own slug).
- **Rate limits:** per IP hash: 5 scans/hour, 20/day; global daily cap (configurable) with a friendly "We're busy, try again soon" message.

---

## PHASE B — Pages, email gate, lead capture

### B1. Landing page `/grader` (and a homepage section linking to it)
- Hero: "How good is your website? Get a free grade in 60 seconds." URL field + "Grade my website" button; optional "Business name" and "City" fields and the "Do you have a Google Business Profile?" (Yes / No / Not sure) + optional Maps link, shown in a light second step or expandable "Improve accuracy".
- Trust row: "Free · No signup to see your score · Takes about a minute".
- Example report preview image, short "What we check" grid (7 categories with icons), FAQ.
- Turnstile widget (invisible/managed).

### B2. Live scan page `/grader/{slug}`
- Animated progress with each category ticking from "Checking…" to ✓ as `progress` updates (poll every 1.5s or use realtime). Show the site screenshot as soon as it's available.
- Copy that keeps them engaged ("Testing mobile speed… Looking for your contact form…").

### B3. Free preview (after scan)
- Big animated score ring + letter grade, site screenshot, 7 category score bars, AI `headline`, and the **top 3 issues** (title + one line).
- Everything else blurred/locked below with the gate card.

### B4. Email gate
- Card: "Unlock your full report + step-by-step fix plan" — name, email, phone (optional), checkbox "Send me tips and offers from SitoMax" (unchecked by default), Turnstile.
- On submit:
  1. Create `grader_unlocks`, set `unlocked = true`.
  2. **Create a lead in the SitoMax Leads inbox** (`GRADER_LEADS_ACCOUNT_ID`), source "Website Grader", with the report link, score, and top issues in the lead details; write a `lead_events` row. Dedup by email (attach new report to the existing lead).
  3. Email the visitor the report link + PDF (Postmark, transactional stream).
  4. Notify Andrew (email) with score, URL, and a link to the lead.
- Reveal the full report immediately without a page reload.

### B5. Full report
- Sections per category with each check: status icon, what we found (value), why it matters, how to fix.
- AI summary, fix plan (numbered), and "SitoMax can fix this for you" CTA block: "Launch a faster, lead-ready site in 7 days" → booking/contact or signup link with the report slug attached (UTM + `ref=grader`).
- "Download PDF" and "Share report" (copy link) buttons.
- "Grade another site" and "Compare with a competitor" (Phase C).

### B6. PDF
- Branded SitoMax PDF (cover with score + screenshot, category summaries, all checks, fix plan, CTA with contact info). Generate server-side, store in Storage, cache per report.

### B7. Follow-up emails (only if `consent_marketing` is checked)
- Day 0: report (always sent, transactional).
- Day 2: "Your #1 fix" (from top_issues[0]) + soft CTA.
- Day 5: before/after style example + CTA.
- Day 10: final check-in.
- Send via Postmark **broadcast** stream with unsubscribe link and physical address footer. Stop the sequence if the lead status changes from New, they unsubscribe, or they sign up.

---

## PHASE C — Extras
- **Shareable public report** `/grade/{slug}` (read-only, noindex by default) with an OG image showing domain + score (generated dynamically).
- **Compare with a competitor:** enter a second URL; side-by-side scores and the top 3 gaps. Counts toward rate limits.
- **Admin view** (super admin, app.sitomax.com): list of reports with score, domain, unlocked status, linked lead; re-run scan; export CSV.
- **Sales mode:** admin-only "Run for prospect" button that skips the gate and Turnstile.

---

## Design spec (premium, matches sitomax.com)
- Landing hero: bold headline, oversized URL input with a pill button, subtle animated gradient or grid background, example report mockup.
- Scan page: centered progress card with category rows animating in sequence, screenshot fading in, smooth (150–300ms) transitions, respects `prefers-reduced-motion`.
- Results: large score ring that animates from 0, letter grade badge color by grade, category bars with icons, issue cards with severity chips (Critical / Improve / Good).
- Gate: blurred report behind a floating card; frictionless, mobile-first form.
- Full report: clean document-style layout, sticky section nav on desktop, collapsible categories on mobile.
- Mobile-first, WCAG AA, dark mode if the marketing site supports it. Lighthouse on `/grader`: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95 (the grader's own page must score well).
- Screenshots at 375px and 1440px of each state (landing, scanning, preview, gate, full report, PDF) in `docs/screenshots/grader/`, using real scans of 2–3 public sites.

---

## Security & abuse
- SSRF protection (A2), Turnstile on scan and unlock, rate limits, URL length limit, block scanning sitomax.com's own infrastructure hosts if needed.
- Sanitize any page text shown in the report (titles, H1s are third-party content).
- Hash IPs; don't store raw HTML longer than processing needs.
- Never expose API keys to the browser.

---

## Acceptance criteria
- [ ] Scan works end-to-end for typical small-business sites in ≤ 60s; each check reports pass/warn/fail/unknown honestly.
- [ ] Works with `PAGESPEED_API_KEY` set and degrades gracefully without it.
- [ ] Places checks are fully hidden and skipped when `GOOGLE_PLACES_API_KEY` is not set, and work when it is.
- [ ] SSRF protections block private/internal addresses, including after redirects (with tests).
- [ ] Scoring follows the configured weights and excludes unknown checks.
- [ ] AI summary validates against the schema and only references actual findings.
- [ ] Free preview shows score, grade, screenshot, category bars, and top 3 issues; rest is locked.
- [ ] Email gate creates/dedups a lead in the SitoMax Leads inbox, emails the report + PDF, and notifies Andrew.
- [ ] Follow-up sequence only sends with consent, includes unsubscribe, and stops on status change/unsubscribe/signup.
- [ ] 24-hour cache and rate limits work; Turnstile verified server-side.
- [ ] Shareable report, competitor compare, and admin view work (Phase C).
- [ ] UI meets the design spec; screenshots saved; `/grader` Lighthouse targets met.