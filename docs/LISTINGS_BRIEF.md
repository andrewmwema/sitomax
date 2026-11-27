# LISTINGS_BRIEF.md — Local Listings Dashboard (BrightLocal, Option 1)

## Goal
Add a **Local Listings** add-on to SitoMax. Fulfillment happens manually in BrightLocal's Citation Builder (white-label). SitoMax is the client-facing experience: the super admin uploads the BrightLocal report, SitoMax parses it into structured rows, and the client dashboard is built entirely from those rows.

**Key design rule:** the dashboard reads from the `listings` table, never from the uploaded file. A future BrightLocal API sync must be able to write to the same tables with zero UI changes.

Follow the existing codebase conventions (framework, folder structure, auth helpers, tenant/client ID naming, UI components, Supabase client usage). Where this brief names a column like `client_id`, use whatever the codebase already uses for the client/site/sub-account tenant key.

---

## Scope (v1)
1. Database tables + RLS
2. Supabase Storage bucket for report files
3. Super-admin upload + import flow (CSV first, PDF fallback via Claude)
4. Import review screen (admin approves before rows are saved)
5. Client-facing Listings tab
6. Stripe add-on purchase + order status
7. Postmark notifications
8. Hook for the monthly report email

**Out of scope (v1):** BrightLocal API integration, automated ordering, review management, rank tracking.

---

## 1. Data model

### `listing_orders`
One per client purchase/campaign.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| client_id | uuid fk | tenant key |
| status | text | `pending_order` \| `ordered` \| `in_progress` \| `complete` \| `cancelled` |
| stripe_subscription_id / stripe_payment_intent_id | text null | depending on add-on billing type |
| brightlocal_campaign_ref | text null | free text, for admin reference |
| ordered_at, completed_at | timestamptz null | |
| created_at, updated_at | timestamptz | |

### `listing_directories` (reference table, global)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| slug | text unique | normalized key, e.g. `yelp`, `bing-places`, `foursquare` |
| name | text | display name |
| domain | text | e.g. `yelp.com` (used for logo/favicon fallback) |
| logo_url | text null | |
| aliases | text[] | alternate names seen in reports, used for matching |

### `listings`
One row per client × directory. This is what the dashboard renders.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| client_id | uuid fk | |
| order_id | uuid fk null | |
| directory_id | uuid fk | → listing_directories |
| status | text | `submitted` \| `pending` \| `live` \| `needs_action` \| `failed` |
| listing_url | text null | live URL when available |
| submitted_at, live_at | timestamptz null | |
| notes | text null | admin-visible notes / reason for needs_action |
| source | text | `report_upload` (later: `brightlocal_api`) |
| last_report_id | uuid fk null | → listing_reports |
| updated_at | timestamptz | |

**Unique constraint:** `(client_id, directory_id)` — imports UPSERT on this key so re-uploads update rows instead of duplicating.

### `listing_reports`
One row per uploaded file.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| client_id | uuid fk | |
| order_id | uuid fk null | |
| file_path | text | Supabase Storage path |
| file_type | text | `csv` \| `xlsx` \| `pdf` |
| parse_status | text | `uploaded` \| `parsed` \| `approved` \| `failed` |
| parsed_payload | jsonb | normalized rows awaiting approval |
| summary | jsonb | counts by status, computed on approval |
| uploaded_by | uuid | super admin user |
| created_at, approved_at | timestamptz | |

### `listing_events` (optional but recommended)
Status-change history used for the timeline and "new this month" stats.
`id, client_id, listing_id, from_status, to_status, occurred_at`

### RLS
- Super admin: full access to all tables.
- Client users: `SELECT` only on `listings`, `listing_orders`, `listing_events`, and `listing_reports` (approved only) where `client_id` matches their tenant.
- `listing_directories`: readable by all authenticated users.
- No client writes.

### Storage
Private bucket `listing-reports`, path `{client_id}/{report_id}.{ext}`. Clients get signed URLs to download the white-labeled report only after approval.

---

## 2. Import flow (super admin)

**Entry point:** Admin → Client → Listings → "Upload report".

1. Admin uploads the file → saved to Storage → `listing_reports` row created (`uploaded`).
2. Server-side parse:
   - **CSV/XLSX (primary):** map columns via a configurable header map (directory/site name, status, URL, submitted date, live date). Keep the map in one config file so it's easy to adjust once we see BrightLocal's real export headers.
   - **PDF (fallback):** send the extracted text to the Claude API with a strict JSON schema and ask it to return only the listing rows. Validate the response against the schema; never trust it blindly.
3. **Normalize:**
   - Directory name → `listing_directories` via slug/aliases (case-insensitive, strip punctuation). Unmatched names are flagged in the review screen with a "create directory" or "map to existing" action.
   - Status text → our enum via a mapping table, e.g. `Live / Completed / Verified → live`, `Submitted / Awaiting publication → pending`, `Action required / Needs verification → needs_action`, `Rejected / Unavailable → failed`. Unknown statuses are flagged for admin choice.
4. Store normalized rows in `parsed_payload`, set `parse_status = parsed`.
5. **Review screen:** table of parsed rows with a diff against current `listings` (new / changed / unchanged), plus flagged issues. Admin can edit cells before approving.
6. **Approve:** in one transaction, upsert into `listings`, write `listing_events` for status changes, set `live_at` when a row becomes `live` for the first time, compute `summary`, set `parse_status = approved`, update the order status (e.g. `complete` when all rows are live/failed).
7. Trigger notifications (section 5).

Rows that exist in `listings` but are missing from a new report are **not deleted**; they're shown in review as "not in this report" so the admin can decide.

---

## 3. Client dashboard — Listings tab

Render from `listings` + `listing_directories` + `listing_events` only.

- **Header:** progress ring "32 of 40 listings live", with counts by status.
- **Notice banner** while anything is pending: "Some directories take up to 6 weeks to publish your listing. We'll update this page as they go live."
- **Directory grid/list:** logo, name, status chip (Live / Pending / Submitted / Needs attention), "View listing" button when `listing_url` exists, and the live date.
- **Filters:** All / Live / Pending / Needs attention.
- **Timeline:** recent status changes from `listing_events`.
- **Report download:** latest approved report via signed URL.
- **Empty state (no add-on):** explain the benefit and show a "Get listed" CTA → Stripe checkout.
- **Order in progress (no report yet):** show "We're submitting your business to directories" with the order status.

Mobile-first; match existing dashboard styling and components.

### Design spec (this must look premium, not like a data table)
The Listings tab is a showcase of value we deliver. It should feel as polished as the premium templates (Showcase, Clarity, Studio).

**Layout**
- **Hero card** at the top: large animated progress ring (animate from 0 to the value on load), big number "32 / 40 live", subtitle "Your business is listed on 32 directories", and three small stat pills (Live, Pending, Needs attention) with counts.
- **Directory grid**: responsive cards — 1 column on mobile, 2 on tablet, 3–4 on desktop. Generous padding, rounded corners (12–16px), subtle border + soft shadow, gentle lift on hover.
- **Each card:**
  - Directory logo (40–48px, rounded square, light background tile). Fallback: favicon from `domain`, then a colored initial avatar. Never a broken image.
  - Directory name (semibold) and domain (muted, small).
  - Status chip with an icon + label: Live = green with a check, Pending/Submitted = amber with a clock, Needs attention = red with an alert, Failed = gray. Use soft tinted backgrounds, not solid blocks.
  - "Live since Mar 4, 2026" (or "Submitted Feb 12" for pending).
  - Primary button **"View listing ↗"** when `listing_url` exists; it opens in a new tab with `rel="noopener noreferrer"`. If there's no URL yet, show a disabled "Not live yet" state, not a dead link.
- **Filter bar**: segmented control (All · Live · Pending · Needs attention) with counts, plus a search box for directory name. Sticky on scroll on mobile.
- **Timeline**: vertical activity feed ("Yelp went live", "Bing Places submitted") with dates and small directory logos; show the latest 10 with "Show more".
- **Report card**: "Latest report · Updated Mar 10" with a download button.
- **Pending notice**: a calm info banner (not a warning), dismissible.

**Polish details**
- Skeleton loaders while data loads; no layout jump.
- Status chips and counts update immediately after a new report is approved.
- Smooth, subtle motion only (150–250ms); respect `prefers-reduced-motion`.
- Dark mode support if the dashboard has it.
- Accessible: chips include text (not color alone), buttons have focus states, contrast meets WCAG AA.
- Empty state uses an illustration or icon composition, a short benefit headline ("Get found on 40+ directories"), 3 bullet benefits, and the CTA.

**Links**
- Validate `listing_url` on import (must be `https://` or `http://`, valid URL). Invalid URLs are flagged in the admin review screen instead of shown to the client.
- Show the clean domain/path on hover or as a tooltip so the client knows where it goes.

**Directory logos**
- Seed `listing_directories` with the common BrightLocal directories (Google, Bing, Apple Maps, Yelp, Facebook, Foursquare, Yellow Pages, Manta, Hotfrog, MapQuest, Nextdoor, BBB, Angi, Data Axle, Neustar Localeze, etc.) with names, domains and logos stored in Supabase Storage, so cards look branded from day one.

---

## 4. Billing (Stripe)
- Create Stripe product(s) for the Local Listings add-on. Support a one-time "Local Listings Boost" price and an optional recurring "Listings Management" price; keep price IDs in config/env.
- On successful payment (webhook), create a `listing_orders` row with `pending_order` and notify the super admin.
- Admin can set the order to `ordered` / `in_progress` manually from the client's Listings admin view.

---

## 5. Notifications (Postmark, from info@sitomax.com)
- **To super admin:** new listings order (includes the client's business name, address, phone, hours, categories, and website pulled from the client's site data, ready to paste into BrightLocal).
- **To client:** order received; first report published; "X new listings went live" after an approval that adds live rows.
- Use the existing Postmark email setup and templates.

---

## 5b. Knowing when listings go live

Three layers, all writing through `applyListingUpdates`:

1. **Report re-uploads (source of truth).** BrightLocal updates the campaign report as directories publish (can take up to 6 weeks). Admin re-uploads the latest report; status changes flow to the dashboard.

2. **Admin re-upload reminders (Vercel Cron, weekly).** For every `listing_orders` row in `ordered`/`in_progress` with any listing still `submitted`/`pending`, email the super admin via Postmark: "Check BrightLocal and upload the latest report for {client} — {n} listings still pending." Stop reminding once the order is `complete` or after 8 weeks (then flag for manual review).

3. **Automatic link checker (Vercel Cron, runs every 6 hours; each run only checks listings that are due).** Check frequency by status:
   - `submitted`/`pending` with a `listing_url`: every 6 hours (catch go-lives fast).
   - `live`, verified within the last 30 days: once a day.
   - `live` and stable for 30+ days: once a week.
   - `needs_action`: once a day until fixed.
   Store `next_check_at` on `listings`; each run selects rows where `next_check_at <= now()`, processes in small batches, and spreads requests to the same domain at least a few seconds apart.

   For every listing checked:
   - Fetch the URL server-side (timeout ~10s, follow redirects, realistic User-Agent, rate-limited per domain).
   - Mark it **verified live** if the response is 2xx and the page contains the client's business name (case-insensitive) — store `last_checked_at`, `last_check_status`, `verified_live_at` on `listings` (add these columns).
   - If a listing with a URL is still `pending`/`submitted` and passes the check, promote it to `live`, set `live_at`, write a `listing_events` row.
   - If a `live` listing fails 3 consecutive checks, set `needs_action` and alert the admin (don't alert the client automatically).
   - Some directories block bots: if a domain consistently returns 403/429, mark the result `unverifiable` and rely on the report instead. Never downgrade a listing to `needs_action` on an `unverifiable` result.

Client dashboard: show a small "Verified Mar 12" note on cards with a recent successful check.

## 5c. Business info changes (name, address, phone, hours)

BrightLocal does NOT update existing citations automatically when business info changes; an "Update Existing Citations" campaign must be ordered (billed per listing). SitoMax manages this as a change-request workflow.

**Single source of truth:** the client's business profile in SitoMax (name, address, phone, hours, categories, website). The website reads from it, and listings are synced from it.

**Flow**
1. Client edits business info in SitoMax. The website updates immediately.
2. If the client has the Listings add-on and a listing-relevant field changed (name, address, phone, website; hours tracked separately), create a `listing_change_requests` row: `id, client_id, changed_fields jsonb (old → new), change_type ('nap' | 'hours_only'), status ('new' | 'quoted' | 'approved' | 'submitted' | 'complete'), fee_cents, stripe_payment_intent_id, created_at, completed_at`.
3. Show the client a confirmation modal before saving NAP changes: "This will update your listings on X directories." Display the update fee if their plan doesn't include it, and collect payment via Stripe. Hours-only changes don't trigger a fee.
4. Email the super admin (Postmark) a clean old → new diff ready to paste into BrightLocal.
5. When the admin marks the request `submitted`, set affected `live` listings to a new status `updating` (add to the enum; chip: blue "Updating").
6. **Link checker verification:** for listings in `updating`, the checker looks for the NEW phone number (digits-only match) and/or new street address on the page. When found → back to `live` with a fresh `verified_live_at`. If the OLD phone/address is still present after 3 weeks → `needs_action` and alert the admin.
7. Request becomes `complete` when no listings remain in `updating`, or when the admin closes it after uploading the update campaign report.

**Plan rules (config, not hard-coded):** e.g. `included_nap_updates_per_year` per plan; beyond that, a one-time update fee price ID.

**Hours:** hours mostly matter on the "Big 5" (Google, Facebook, Apple Maps, Bing, Yelp). Hours-only changes are handled per the plan rules in section 5d — never via a paid BrightLocal update campaign. Future: direct Google Business Profile API sync for hours.

**Client UI:** on the Listings tab, show a banner while a change request is in progress: "Updating your new phone number across 32 directories — 18 confirmed so far."

## 5d. Profile access, onboarding order, and who updates what

### Onboarding order (must happen before the initial campaign is ordered)
1. **Business details step:** client completes the full business profile in SitoMax — name, address, phone, hours (incl. special/holiday hours), categories, description, website, logo, photos. Validate phone/address formats. This is the exact data sent to BrightLocal.
2. **"Connect your profiles" step:** guided checklist, one card per Big 5 platform, each with a short visual how-to and a deep link:
   - **Google Business Profile:** "Add listings@sitomax.com as a Manager" (client stays Owner). Option: "I don't have a Google profile" → BrightLocal will create it in the campaign.
   - **Facebook:** "Give SitoMax partner access to your Page in Meta Business Suite."
   - **Apple Business Connect:** claim/add us as a user, or "I'll manage Apple myself."
   - **Bing Places:** "Import from Google" (usually no access needed).
   - **Yelp:** client-managed; "I've claimed my Yelp page" checkbox.
   Each card has states: `not_started` | `client_says_done` | `admin_confirmed` | `client_self_manages` | `not_applicable`. Store in `profile_connections (id, client_id, platform, state, notes, updated_at)`. Admin confirms access from the admin view.
3. **Order gate:** the admin's "Ready to order" indicator turns green only when business details are complete and Google + Facebook are `admin_confirmed`, `client_self_manages`, or `not_applicable`. Admin can override with a note.
4. **Initial campaign:** admin orders the BrightLocal Citation Builder campaign with the Big 5 selected plus the standard directory set. Admin email includes the business details and the access status for each platform.

### Who updates what after launch (plan-driven config)
| Change | Starter / Growth | Premium (or higher Listings plan) |
|---|---|---|
| Hours — Big 5 | Client self-updates via checklist | SitoMax handles (Manager access, or BrightLocal Active Sync if enabled for that client) |
| Phone/address — Big 5 | Client self-updates via checklist | SitoMax handles |
| Phone/address — other directories | Paid BrightLocal update campaign (update fee) | Included per `included_nap_updates_per_year`, then update fee |
| Hours — other directories | Not updated (low impact) | Not updated (low impact) |

Keep these rules in a config file keyed by plan, plus a per-client `active_sync_enabled` flag.

### Self-update checklist (client-managed changes)
- Triggered right after a client saves business-info changes in SitoMax.
- Modal + persistent card on the Listings tab: "Update your other profiles" with one row per Big 5 platform relevant to the change, each with an **Update now ↗** deep link and a "Done" checkbox.
- Store in `self_update_tasks (id, client_id, change_request_id, platform, status ('open' | 'done' | 'skipped'), created_at, done_at)`.
- Postmark reminder if any task is still `open` after 3 days, and once more after 7 days.
- For phone/address changes, the link checker still verifies the new value on profiles with a known URL and shows "Confirmed" per platform.
- Upsell line on the card: "Want us to handle this for you? Upgrade to Premium."

### SitoMax-managed changes (Premium)
- Admin gets the change diff with a per-platform checklist (Google, Facebook, Apple, Bing, Yelp-notify-client).
- If `active_sync_enabled`, note "Active Sync will push this automatically" and only require confirmation.
- Admin marks each platform done; the client sees progress on the Listings tab.

## 6. Monthly report hook
Expose a helper, e.g. `getListingsSummary(clientId, periodStart, periodEnd)`, returning total live, total listings, and new live in the period (from `listing_events`). The monthly results email can call it when it exists.

---

## 7. Future-proofing (don't build, just don't block)
- A future `brightlocal_api` sync job will upsert into `listings` with `source = 'brightlocal_api'` and write `listing_events` the same way. Keep the upsert + event logic in one shared server function (e.g. `applyListingUpdates(clientId, rows, source)`) used by both the upload approval and the future sync.

---

## Acceptance criteria
- [ ] Migrations create all tables, the unique constraint, and RLS policies; clients can't read other clients' data.
- [ ] Admin can upload CSV/XLSX and see parsed, normalized rows with a diff before approving.
- [ ] PDF upload works via Claude extraction with schema validation; failures show a clear error.
- [ ] Re-uploading a newer report updates existing rows and logs status changes; no duplicates.
- [ ] Unknown directories/statuses are flagged and resolvable in the review screen.
- [ ] Client Listings tab shows progress, status chips, links, timeline, and report download, with correct empty/in-progress states.
- [ ] Listings tab meets the Design spec: card grid with logos (no broken images), animated progress ring, status chips with icons, working "View listing" links opening in a new tab, skeleton loading, responsive on mobile, and accessible.
- [ ] Invalid listing URLs are caught in admin review and never shown to clients.
- [ ] Onboarding collects full business details and runs the "Connect your profiles" checklist; the admin "Ready to order" gate works with override.
- [ ] Business-info changes create a change request; NAP changes show the confirmation modal and charge the update fee when the plan requires it.
- [ ] Starter/Growth clients get the self-update checklist with deep links and reminder emails; Premium changes go to the admin checklist.
- [ ] Plan rules and `active_sync_enabled` live in config, not hard-coded.
- [ ] Stripe purchase creates an order and emails the admin with the client's business info.
- [ ] Client gets a Postmark email when new listings go live.
- [ ] `applyListingUpdates` is the single write path for listing changes.