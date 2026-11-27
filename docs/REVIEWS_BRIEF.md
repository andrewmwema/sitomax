# REVIEWS_BRIEF.md — Reputation & Reviews (Upload-Post + existing Leads inbox)

## Goal
Help SitoMax clients get more Google reviews, see and reply to every review in SitoMax, and show reviews on their website and social channels. This builds on what already exists:
- **Leads inbox / light CRM** (`form_submissions`/leads, `lead_events`, `lead_messages`, statuses new/contacted/won/lost, Postmark replies, Haiku "✨ Draft reply").
- **`lib/email` (Postmark)**, `sites.business`, `sites.timezone`, credits/`ai_usage`, RLS by account membership, sanitizer.
- **`SocialProvider` / `UploadPostProvider`** from SOCIAL_BRIEF.md (Google Business reviews list + reply live there).

**The loop we're building:** lead → reply → mark Won → review request → review lands on Google → shows in SitoMax + on the website → shared to social → counted in the monthly results email.

Work in phases. After EACH phase: build, lint, typecheck, tests, commit "Reviews phase X: …", push, STOP and summarise. Migrations use the next free number; remind Andrew to run them in the Supabase SQL Editor. Never fabricate numbers or reviews.

---

## Compliance rules (non-negotiable)
1. **No review gating.** Every customer who gets a request must see the public review links (Google, and Facebook/Yelp if configured). The "private feedback" option is offered to everyone as an extra, never used to filter unhappy customers away from Google. (Google policy and the FTC rule on consumer reviews prohibit suppressing negative reviews.)
2. **No incentives** for reviews in request templates (no discounts or gifts for reviewing).
3. **No fake or edited reviews.** We only display real reviews pulled from the source, unedited (truncation with "Read more" is fine).
4. **Review requests are 1:1 messages to real customers** of the business, never bulk marketing. Include the business name and address in the footer and an unsubscribe/"don't ask again" link.
5. **No self-serving review schema markup** (LocalBusiness/Organization review stars about the business itself) on client websites.

---

## PHASE A — Review requests + landing page (no third parties)

### A1. Data (migration)
**`review_settings`** (one per site)
| column | type | notes |
|---|---|---|
| site_id | uuid pk/fk | |
| google_review_url | text null | direct "write a review" link (e.g. https://search.google.com/local/writereview?placeid=…) |
| google_place_id | text null | |
| facebook_review_url, yelp_review_url | text null | optional |
| auto_request_on_won | bool | default false |
| auto_request_delay_hours | int | default 24 |
| reminder_enabled | bool | default true |
| reminder_delay_days | int | default 3 |
| request_subject, request_body | text | templates with {customer_first_name}, {business_name}, {review_link} |
| sender_name | text | default business name |

**`review_requests`**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| site_id | uuid fk | |
| lead_id | uuid fk null | when sent from a lead |
| customer_name, customer_email | text | customer_phone reserved for later SMS |
| channel | text | `email` (later `sms`) |
| status | text | `scheduled` \| `sent` \| `opened` \| `clicked` \| `reviewed` \| `feedback_received` \| `failed` \| `opted_out` \| `cancelled` |
| token | text unique | unguessable, for the landing page URL |
| scheduled_at, sent_at, opened_at, clicked_at, reminder_sent_at | timestamptz null | |
| clicked_platform | text null | `google` \| `facebook` \| `yelp` |
| postmark_message_id | text null | |
| created_by | uuid null | |
| created_at | timestamptz | |

**`review_opt_outs`**: `site_id, email, created_at` (unique per site + email).

**`review_feedback`** (private feedback): `id, site_id, request_id null, lead_id null, name, email, rating int null, message, created_at`.

RLS: account members of the site; super admin all. The landing page reads/writes via server routes using the token only.

### A2. Sending requests
- **From a lead:** "⭐ Ask for a review" button in the lead drawer/conversation header (enabled for leads with an email). Opens a small sheet: preview of the message, edit, Send now / Schedule.
- **Automatic:** if `auto_request_on_won`, marking a lead Won schedules a request after `auto_request_delay_hours`. Cancel it automatically if the lead is moved off Won before it sends.
- **Other automatic triggers (each a separate setting, all off by default):** booking marked **Completed** (BOOKING_BRIEF.md) and invoice **Paid** (PAYMENTS_BRIEF.md). Expose one function `scheduleReviewRequest({ siteId, leadId, trigger, delayHours })` that all features call, and never send more than one request per customer per 90 days regardless of trigger.
- **Manual add:** "Request reviews" page → add a customer (name + email), or upload a CSV (name, email), preview count, confirm. Hard cap per batch (default 100) and per day (default 200, configurable by super admin).
- **Dedup + opt-outs:** never send to an opted-out email; never request the same email more than once per 90 days per site (show a warning with override for admin only).
- **Sending:** Postmark via `lib/email` on a dedicated message stream `review-requests`, From `"{Business} <reviews@mail.ROOT_DOMAIN>"`, Reply-To the site's notification email. Track opens/clicks via Postmark webhooks → update `review_requests`.
- **Reminder:** one reminder after `reminder_delay_days` if not clicked. Never more than one.
- **Cron:** Vercel Cron every 5 minutes sends due scheduled requests and reminders (atomic claim to avoid double sends).
- Every request/send/click writes a `lead_events` row (`review_requested`, `review_link_clicked`, `feedback_received`) when tied to a lead, so it shows in the lead timeline.

### A3. Review landing page (public)
- URL: `https://{site domain or app host}/r/{token}` (plus a generic `/r/s/{siteSlug}` for QR codes and links).
- Branded with the site's logo, colors, and business name. Mobile-first, fast, no login.
- Headline: "How was your experience with {Business}?" Optional 1–5 star tap (for analytics only; it MUST NOT change which options are shown).
- **Always show** large buttons: "Review us on Google" (primary), plus Facebook/Yelp if configured. Clicking logs `clicked_platform` and redirects.
- Below: "Have private feedback for us?" → short form (name, email, message). Submissions create `review_feedback` AND a new lead/conversation in the Leads inbox (source "Private feedback") with a notification to the owner.
- "Don't ask me again" link → `review_opt_outs`.

### A4. Review link + QR code
- Settings → Reviews: paste or auto-build the Google review link (help text on how to find the Place ID; if Google Places lookup is available later, add search-by-name).
- Generate a downloadable QR code (PNG + SVG) and a printable card (PDF) for the generic landing URL. Copy-link button.

### A5. UI — Reviews → Requests
- Stat tiles: Sent this month · Click rate · Reviews attributed (Phase B) · Private feedback.
- Table of requests with status chips, customer, sent date, source (lead / manual / CSV / auto), resend (admin only, respects rules), cancel scheduled.

---

## PHASE B — Google reviews monitoring + replies (Upload-Post)

### B1. Data (migration)
**`reviews`**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| site_id | uuid fk | |
| source | text | `google` (later `facebook`) |
| external_id | text | provider/Google review id |
| author_name, author_photo_url | text null | |
| rating | int | 1–5 |
| comment | text null | |
| review_created_at, review_updated_at | timestamptz | |
| reply_text | text null | owner reply currently on Google |
| reply_updated_at | timestamptz null | |
| reply_status | text | `none` \| `draft` \| `posting` \| `posted` \| `failed` |
| draft_reply | text null | |
| status | text | `needs_reply` \| `replied` \| `ignored` |
| show_on_website | bool | default true for rating ≥ 4 |
| request_id | uuid null | best-effort attribution (see B3) |
| first_seen_at | timestamptz | |
Unique `(site_id, source, external_id)`.

### B2. Sync (polling — Upload-Post has no review webhooks)
- Use `SocialProvider.listGoogleReviews` (implemented in `UploadPostProvider` against Upload-Post's Google Business reviews endpoints — confirm params/response shape in docs and record them in `docs/SOCIAL_PROVIDER_NOTES.md`).
- **Vercel Cron every 3 hours** → `/api/reviews/sync`: for each site with a connected Google Business account, page through reviews (stop when reaching reviews older than the last sync + a 7-day overlap), upsert into `reviews`, detect new reviews and changed reply text.
- Also offer a "Sync now" button (rate-limited to once per 10 minutes per site).
- If the Google connection is missing/expired, show "Connect Google to see your reviews" (reuse the social connect flow) and email the client once.

### B3. Attribution (best-effort, honest)
- When a new review arrives, if a `review_requests` row for that site was `clicked` with `clicked_platform = google` within the previous 14 days and the reviewer name matches the customer name (case-insensitive, first name + last initial is enough), link it and set the request to `reviewed`.
- Show attribution as "Likely from your request" — never claim certainty.

### B4. Alerts (Postmark)
- New review ≤ 3 stars: immediate email to the owner with the review text and a "Reply now" link.
- Others: daily digest (only if any new reviews).

### B5. Replies
- Reviews inbox (Reviews → All reviews): filters Needs reply · Replied · 5★ · 4★ · ≤3★ · search.
- Review card: stars, author avatar/initials, date, text, reply box.
- **✨ Draft reply** with Haiku (same pattern as lead replies; uses `sites.business`, review text, rating, optional tone). Rules in the prompt: thank by first name, reference specifics from the review, never invent facts/offers, never admit legal liability, for negative reviews apologise, take it offline with the business phone/email, keep under ~80 words. Counts toward `ai_usage`/credits.
- **Post reply** → `SocialProvider.replyToGoogleReview`. Google keeps one owner reply per review and overwrites it, so before posting, re-fetch the review; if `reply_text` changed since the draft was opened (someone replied directly on Google), warn and ask to confirm overwrite.
- Saved reply templates per site.
- After posting, set `status = replied`, write a `lead_events`-style row if the review is attributed to a lead.

---

## PHASE C — Show and share reviews

### C1. Website "Reviews" section (section library)
- Add a premium Reviews block to the section library with 3 variants: **Carousel**, **Masonry grid**, **Spotlight** (one large featured review + rating summary). Same row style/animation/spacing options as other blocks.
- Data: `reviews` where `show_on_website = true`, newest first, with an optional minimum rating setting (default 4).
- Rating summary: "4.9 ★ from 127 Google reviews" computed from all synced Google reviews (all ratings, honest average) with a "See all on Google" link.
- **Badge component** for header/footer: compact stars + average + count.
- Server-rendered with caching (revalidate on sync). No review schema markup (see compliance).
- Client can hide individual reviews from the website (does not delete them).

### C2. Share to social
- On any 4–5★ review: "Share to social" → opens the Social composer (SOCIAL_BRIEF.md) prefilled with a branded review image (generated card: stars, quote excerpt, reviewer first name + last initial, business logo/colors) and AI-written caption.

---

## PHASE D — Dashboard + reporting

- **Reviews home:** average rating (all-time) and rating trend (last 6 months), total reviews, new this month, reply rate, average time to reply, requests sent → clicked → reviewed funnel.
- "Needs attention" card: unreplied reviews (oldest first), ≤3★ highlighted.
- **Monthly results email hook:** `getReviewsSummary(siteId, periodStart, periodEnd)` → new reviews, average rating in period, all-time average, replies posted, requests sent. Example line: "6 new reviews this month · 4.9 ★ average".

---

## Plans & gating (config, not hard-coded)
- `reviews_link_qr_widget` (Starter+): review link, QR code, landing page, website Reviews block.
- `reviews_requests` (Growth+): manual + automatic requests, reminders. Monthly request cap per plan.
- `reviews_monitoring` (Growth+): Google sync, alerts, replies, AI drafts.
- `reviews_ai_drafts_per_month` per plan.

---

## Design spec (premium, consistent with SOCIAL_BRIEF.md §13)
- Reviews home: hero card with large average rating, animated stars, total count, trend sparkline; stat tiles; "Needs attention"; recent reviews list.
- Review cards: generous padding, author avatar (initials fallback), star row, relative date, "Replied" chip, reply shown indented below with the business logo.
- Reply composer inline under the card, with ✨ Draft, tone chips (Warm · Professional · Brief), and character counter.
- Request sheet: clean preview of the email as the customer will see it.
- Landing page: beautiful, branded, one-thumb usable; big Google button; fast (< 1s LCP on 4G).
- Skeletons, empty states ("No reviews yet — send your first request"), plain-English errors, dark mode, WCAG AA, keyboard support. Screenshots at 375px and 1440px (light + dark) in `docs/screenshots/reviews/` using realistic seed data.

---

## Security
- Landing page tokens are random (≥ 128 bits) and single-site scoped; rate-limit landing page and feedback form; honeypot + basic spam checks on feedback.
- Upload-Post API key server-side only.
- Sanitize all review and feedback text before rendering (reviews are third-party content).
- Never log message bodies or customer emails in server logs.

---

## Acceptance criteria
- [ ] Phase A: requests can be sent from a lead, automatically on Won (with delay and auto-cancel), manually, and via CSV; opt-outs, dedup, caps, and one reminder work; opens/clicks tracked; events appear in the lead timeline.
- [ ] Landing page always shows public review links to everyone (no gating); private feedback creates a lead in the inbox and notifies the owner.
- [ ] Review link, QR code (PNG/SVG) and printable card work.
- [ ] Phase B: Google reviews sync every 3 hours via Upload-Post with "Sync now"; new ≤3★ reviews alert immediately; daily digest works.
- [ ] AI draft replies follow the prompt rules; posting a reply works and warns before overwriting a reply changed on Google.
- [ ] Attribution links reviews to requests conservatively and labels it "Likely".
- [ ] Phase C: Reviews block (3 variants) and badge render real synced reviews with an honest average; no review schema; hide-from-website works; Share to social prefills the composer with a branded image.
- [ ] Phase D: dashboard metrics and `getReviewsSummary` are correct from real data.
- [ ] Plan gating from config; UI meets the design spec with screenshots saved.