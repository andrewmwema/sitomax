# SEO_BRIEF.md — Search Visibility: Sitemaps, IndexNow, Google Search Console & unified Analytics

## Goal
Make every SitoMax client site easy for search engines to find, automatically, and show clients how they perform on Google, not just on their site.

1. **Sitemaps done right** (accurate `lastmod`, robots.txt reference) — every plan.
2. **IndexNow** instant notifications to Bing and other participating engines on every publish — every plan.
3. **Google Search Console, automated:** SitoMax verifies each client site, adds it as a property, submits the sitemap, and pulls search performance (clicks, impressions, CTR, position, queries) and index status — Growth+.
4. **Unified Analytics area** with tabs: Overview · Website traffic (existing) · Google Search (new) · SEO health (new) — one place, premium design.
5. **Monthly results email** gets search lines.

### How this differs from what exists
- **Existing Analytics (BUILD_PLAN Phase 7):** first-party page-view beacon → visits, uniques, top pages, referrers, devices, form submissions. *What visitors do on the site.* **Keep it; move it into the "Website traffic" tab and restyle.**
- **Existing SEO toolkit (Phase 7b) and sitemap/robots (Phase 9):** page meta, local business schema, OG tags, manual Search Console verification field, tracking codes, redirects, per-page SEO checklist, sitemap.xml, robots.txt. **Reuse; don't rebuild.**
- **New here:** Google Search Console automation + data, IndexNow, sitemap/index status, combined Overview, SEO health score.

**Known from the build plan (verify in Step 0):**
- Analytics: tenant beacon → `POST /api/analytics` → `page_views` (path, referrer, `visitor_hash` = sha256(ip + UA + date + salt), device, country from `x-vercel-ip-country`; no raw IPs; skips preview/editors). Dashboard Analytics page per site: 7/30/90-day picker, visits, unique visitors, form submissions, visits-per-day line chart, top pages, top referrers, device split (SQL aggregation). Country is collected but may not be displayed yet.
- SEO toolkit (migration `0004_seo.sql`): `sites.seo` jsonb (business type/name/address/phone/hours, default share image, Search Console verification code, GA ID, Meta Pixel ID), `pages.seo` (SEO title, description, share image, noindex), `redirects` table, `generateMetadata` with canonical/OG/Twitter/robots/verification meta, JSON-LD LocalBusiness, per-site `sitemap.xml` + `robots.txt`, GA/Pixel via next/script, 301 redirects, alt text + next/image, dashboard SEO tab at `/dashboard/sites/[siteId]/seo` (business info, tracking codes, verification field, redirects, per-page checklist with Fix links), and the editor's SEO panel.
- The automated verification in Phase C must coexist with the manual verification field: render both tags if both exist (Google allows multiple verification tags).

**Step 0 (before any code):** inspect the repo and write `docs/SEO_EXISTING_AUDIT.md` listing what already exists from Phases 7, 7b and 9 (tables, routes, components, sitemap generation, robots.txt, verification field, checklist logic) and what's missing. Build only the gaps.

Work in phases. After EACH phase: build, lint, typecheck, tests, commit "SEO phase X: …", push, STOP and summarise. Migrations use the next free number; remind Andrew to run them in the Supabase SQL Editor.

**Facts to respect**
- Google's sitemap "ping" endpoint is retired (requests return 404); do **not** implement pings. Google discovers sitemaps via robots.txt and Search Console and relies on accurate `lastmod`.
- Bing's anonymous sitemap ping is also retired; use **IndexNow** for Bing/Yandex/Seznam/Naver. Google does not participate in IndexNow.
- Do **not** use Google's Indexing API (it's only for job posting / livestream pages).
- Never fabricate numbers. Search Console data lags ~2–3 days; label it ("Google data through Mar 10").

---

## Environment
| var | notes |
|---|---|
| `GOOGLE_CLOUD_PROJECT_ID` | same free project as the PageSpeed key |
| `GSC_SERVICE_ACCOUNT_JSON` (or OAuth refresh token for a SitoMax Google account) | identity that verifies and owns client properties — confirm the supported approach in Google's docs (see C0) |
| `INDEXNOW_KEY` | optional global default; per-site keys preferred (generated) |
| `SEO_GSC_ENABLED` | feature flag |

Remind Andrew to enable the **Google Search Console API** and **Google Site Verification API** in the Google Cloud project (no billing required) and add env vars in Vercel.

---

## PHASE A — Sitemaps & robots.txt (upgrade existing)
- Confirm/upgrade the per-site `/sitemap.xml`: published pages + published blog posts only; exclude noindex pages, drafts, password-protected pages, redirects, and utility pages (e.g. `/r/…`, `/sign/…`, `/book/manage/…`, `/invoice/…`, `/pay/…`, chat/booking API routes).
- **Accurate `lastmod`:** the real last *published content* change per URL (not build time, not every request). Store `content_updated_at` per page/post if missing.
- Use a sitemap index (`/sitemap.xml` → `/sitemap-pages.xml`, `/sitemap-posts.xml`) when > 1,000 URLs; otherwise a single file.
- Canonical host: the custom domain if connected and verified, otherwise the subdomain. The subdomain must not compete with the custom domain (301 to canonical + canonical tags).
- `robots.txt`: allow all public pages, disallow utility routes listed above, and include `Sitemap: https://{canonical}/sitemap.xml`. Respect a per-site "Hide from search engines" setting (Disallow all + noindex) for staging/unfinished sites, shown prominently in the dashboard when on.
- Cache sitemap/robots responses and revalidate on publish.

## PHASE B — IndexNow (every plan)
- Generate a per-site IndexNow key; serve it at `https://{canonical}/{key}.txt` (plain text, the key only).
- On publish/update/unpublish of a page or post, enqueue the changed URLs; a worker (Vercel Cron every 5 minutes, or immediate background call) submits batches via the IndexNow protocol (`POST https://api.indexnow.org/indexnow` or a participating engine endpoint) with `host`, `key`, `keyLocation`, `urlList`.
- Debounce: one submission per URL per 10 minutes; skip when the site is hidden from search engines or on a non-canonical host.
- Store results in `seo_indexnow_log (site_id, urls, status_code, submitted_at)`; surface "Bing notified ✓ 2h ago" in SEO health.

---

## PHASE C — Google Search Console automation (Growth+)

### C0. Identity & ownership (confirm in docs first)
Record the confirmed approach in `docs/SEO_GOOGLE_NOTES.md`:
- SitoMax uses one Google identity (service account or a dedicated SitoMax Google account via OAuth) to: request a verification token from the **Site Verification API** (META method), have SitoMax render that meta tag in the client site's `<head>`, call verify, then add the property and submit the sitemap via the **Search Console API**.
- Prefer a **URL-prefix property** for the canonical origin (`https://www.example.com/`), since DNS verification for domain properties requires client DNS changes.
- Optional: add the client's Google email as an additional owner (via the Site Verification resource's owners, if supported) so they can open Search Console directly. Note limits/quotas.
- If a service account can't own properties as needed, fall back to a SitoMax Google account with stored OAuth refresh token (server-side only, encrypted).

### C1. Data (migration)
**`seo_google_properties`**
| column | type | notes |
|---|---|---|
| site_id | uuid pk/fk | |
| property_url | text | e.g. `https://www.example.com/` |
| verification_token | text | meta tag content |
| status | text | `not_connected` \| `verifying` \| `verified` \| `added` \| `sitemap_submitted` \| `error` |
| error_message | text null | |
| client_owner_email | text null | |
| sitemap_submitted_at, sitemap_last_downloaded_at | timestamptz null | from Search Console sitemap info |
| sitemap_warnings, sitemap_errors | int | |
| last_synced_at | timestamptz | |

**`seo_search_daily`** — `site_id, date, clicks, impressions, ctr, position` (site totals; unique per site+date)
**`seo_search_queries`** — `site_id, period_start, period_end, query, clicks, impressions, ctr, position` (top N per period)
**`seo_search_pages`** — `site_id, period_start, period_end, page, clicks, impressions, ctr, position`
**`seo_search_devices`/`seo_search_countries`** (optional) — same shape by dimension.
**`seo_index_status`** — `site_id, url, verdict, coverage_state, last_crawl_time, checked_at` (URL Inspection results for key pages; respect quotas).

RLS: account members read their site's rows; server writes only.

### C2. Connection flow
- Auto-run when a site (a) is on an eligible plan, (b) has a verified canonical host serving from SitoMax, (c) is not hidden from search engines. Also a "Connect to Google" button in SEO health with a progress stepper: Verify ownership → Add to Search Console → Submit sitemap → Done.
- The verification meta tag is rendered only on the site's home page `<head>` from `seo_google_properties.verification_token`.
- Re-run on domain changes (custom domain connected/changed → new property for the new canonical, keep the old one read-only for history).
- Clear error states with fixes ("Your domain isn't pointing to SitoMax yet").

### C3. Sync jobs (Vercel Cron)
- **Daily (early morning UTC):** Search Analytics for the last 3 days + backfill gaps (initial backfill: 16 months, chunked); site totals by date; top 250 queries and pages for rolling 28-day and current month periods; sitemap status.
- **Weekly:** URL Inspection for up to the top 20 pages (by traffic or priority: home, services, contact) within quota; store index verdicts.
- Respect API quotas with backoff; per-site jitter so jobs spread out.

---

## PHASE D — Unified Analytics area (dashboard)

Route: Dashboard → **Analytics** (existing route, restructured) with tabs: **Overview · Website traffic · Google Search · SEO health**. Shared date range picker (7 / 28 / 90 days, This month, Last month, 12 months, Custom) and **Compare to previous period** toggle at the top, persisted per user.

### D1. Overview (new)
- **Hero row (4 stat tiles):** Google impressions · Google clicks · Website visits · Leads (form submissions + chat + bookings where available), each with delta vs previous period and a sparkline.
- **Journey funnel:** Impressions → Clicks → Visits → Leads with conversion percentages between steps (only show steps with real data; label sources).
- **Trend chart:** clicks and visits over time on one chart (two series, shared x-axis), with annotations for publishes (e.g. "Published 'Water Heater Repair' page").
- **Top 5 searches** and **Top 5 pages** cards with "See all →" into the tabs.
- **SEO health score** card (0–100 ring) with the top 3 fixes.

### D2. Website traffic (existing analytics, restyled)
- Keep existing metrics and SQL aggregations; apply the premium design: stat tiles, visits chart, top pages, referrers (with favicons), devices (bar, not pie), countries, form submissions, and new **traffic sources** grouping (Search, Direct, Social, Referral, Email/Campaign via UTM).

### D3. Google Search (new)
- Stat tiles: Clicks · Impressions · Avg CTR · Avg position (lower is better — show the delta direction correctly).
- Main chart: clicks and impressions over time (toggle CTR/position).
- **Queries table:** query, clicks, impressions, CTR, position, change vs previous period (arrows), with search and sort; "Opportunity" badge for queries with high impressions and position 8–20.
- **Pages table:** page, clicks, impressions, CTR, position; click a page → page detail drawer with its own chart and queries.
- Devices and countries split.
- Data freshness label ("Google data through Mar 10") and a not-connected state with the connect CTA.

### D4. SEO health (new)
- **Health score (0–100)** combining: sitemap submitted and error-free, % of key pages indexed, robots/noindex correctness, per-page checklist results (from Phase 7b: titles, descriptions, H1, alt text, schema, OG), page speed (reuse grader/PageSpeed logic for the home page weekly, optional), HTTPS/canonical, IndexNow active.
- **Status cards:** Google connection (step status), Sitemap (submitted ✓, last read by Google, URLs, warnings/errors), Indexing (X of Y key pages indexed; list with verdicts), Bing/IndexNow (last notified), Hidden-from-search warning (if on).
- **Fix list:** prioritized issues with plain-English explanations and **Fix →** buttons that deep-link into the editor's SEO fields for that page.
- "Open in Google Search Console ↗" (if the client was added as owner).

### D5. Design spec — upscale, modern, polished (this is a selling feature)
Quality bar: **Plausible, Vercel Analytics, Stripe Dashboard, Linear.** Calm, precise, instantly readable. Reuse SitoMax dashboard tokens (same system as SOCIAL_BRIEF.md §13 and PAYMENTS_BRIEF.md design spec).
- **Layout:** sticky header with title, tabs (underline style with smooth indicator), date range + compare controls on the right; content in a 12-column grid with generous gaps (24–32px).
- **Stat tiles:** label (13px muted), big number (28–32px, tabular figures), delta chip (▲ green / ▼ red, inverted for position), mini sparkline; hover shows the exact previous value.
- **Charts:** smooth lines/areas with low-opacity accent fills, minimal gridlines, crosshair tooltips with exact values and dates, comparison period as a dashed muted line, publish annotations as small dots on the x-axis with tooltips. No pie charts, no 3D. Accessible summaries and a "View as table" toggle.
- **Funnel:** horizontal steps with proportional bars, conversion % between steps, muted when data is missing.
- **Tables:** clean, zebra-free, hairline row dividers, right-aligned numbers, sortable headers, inline mini bars for clicks/impressions, sticky header, search; mobile → cards.
- **Health score ring:** animated from 0, color by band (green ≥ 80, amber 50–79, red < 50), with a short verdict ("Good — 3 quick wins available").
- **Fix list items:** severity chip (Critical / Improve / Good), title, one-line why, **Fix →**; completed items fade to a "Done" section.
- **Empty/not-connected states:** friendly illustration/icon composition and clear CTA ("Connect to Google to see your searches"); new-site state explains data appears in 2–3 days.
- **Loading:** skeletons matching final layout; no layout shift; charts animate in once (400ms).
- **Motion:** 150–250ms; count-up numbers on first load; respects `prefers-reduced-motion`.
- **Responsive:** test 375 / 768 / 1280 / 1440px; tabs scroll horizontally on mobile; charts keep readable ticks.
- **Accessibility:** WCAG AA in light and dark mode, keyboard navigation for tabs/tables/date picker, ARIA labels, live region announcements on range change.
- **Formatting:** thousands separators, CTR as percentage with 1 decimal, position with 1 decimal, relative dates in lists with exact on hover, business time zone.

### D6. Quality gate
- Seed realistic demo data (a plumber and a salon: 90 days of visits, 16 months of Search Console-shaped data, 200 queries, 40 pages, index statuses with a few issues).
- Screenshots of every tab and state (connected, not connected, verifying, error, empty, loading) at 375px and 1440px, light and dark, saved to `docs/screenshots/analytics/`.
- Self-review against the spec and fix gaps before handing off.

---

## PHASE E — Reporting & integrations
- **Monthly results email:** `getSearchSummary(siteId, start, end)` → impressions, clicks, average position, top query, top page, change vs previous month. Example: "Your site appeared in Google 3,240 times this month and got 186 clicks. Top search: 'plumber near me'." Combine with existing traffic and leads lines.
- **Website grader (GRADER_BRIEF.md):** marketing copy can mention "SitoMax connects your site to Google automatically" (no code dependency).
- **Blog:** publishing a post triggers sitemap revalidation + IndexNow; the post editor shows "Google: not indexed yet / indexed ✓" once inspected.
- **Super admin view:** list of sites with Google connection status, sitemap errors, health score, and bulk "Reconnect / Resubmit".

---

## Plans & gating (config, not hard-coded)
- Every plan: sitemaps, robots.txt, IndexNow, SEO health (basic checks), Website traffic.
- Growth+: Google Search Console connection, Google Search tab, Overview funnel, index inspection, search lines in the monthly email.
- `seo_url_inspection_pages_per_week` per plan.

## Security & privacy
- Google credentials server-side only (encrypted at rest if stored as refresh tokens).
- Clients only see their own site's data; no cross-site leakage in super admin aggregations shown to clients.
- No raw IPs (existing hashing remains); Search Console data is aggregate.

---

## Acceptance criteria
- [ ] `docs/SEO_EXISTING_AUDIT.md` and `docs/SEO_GOOGLE_NOTES.md` written; only gaps built.
- [ ] Sitemaps include only public indexable URLs with accurate `lastmod`; robots.txt references the sitemap and disallows utility routes; "Hide from search engines" works; canonical host handling is correct.
- [ ] No sitemap pings implemented; IndexNow key file served and changed URLs submitted on publish with debouncing and logging.
- [ ] Google connection verifies via meta tag, adds the property, submits the sitemap, and handles domain changes and errors; optional client owner added.
- [ ] Daily Search Analytics sync with 16-month backfill, top queries/pages, sitemap status; weekly URL inspection within quota.
- [ ] Analytics area has Overview, Website traffic (existing, restyled), Google Search, and SEO health tabs with shared date range + compare.
- [ ] Health score and fix list deep-link to the right editor fields.
- [ ] Design spec met (tiles, charts with comparison and annotations, funnel, tables, health ring, states, responsive, accessible); quality gate screenshots saved.
- [ ] `getSearchSummary` feeds the monthly results email correctly.