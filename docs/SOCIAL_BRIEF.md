# SOCIAL_BRIEF.md — Social Media Posting (Upload-Post)

## Goal
Let SitoMax clients connect their social profiles and create, schedule, and publish posts from inside SitoMax, branded entirely as SitoMax. Upload-Post (https://docs.upload-post.com) handles OAuth, token storage, and publishing to each network. SitoMax owns the UI, the content, the calendar, the AI generation, and the data.

**Key design rules**
1. All Upload-Post calls live in ONE provider module behind an interface (`SocialProvider`). No other file calls Upload-Post directly. This lets us swap to Zernio (or another provider) later without touching the UI.
2. SitoMax's database is the source of truth for posts, schedules, and status. The provider is only the delivery mechanism.
3. Follow existing codebase conventions (framework, folders, auth helpers, tenant/client ID naming, UI components, Supabase client usage, Postmark email setup, Stripe billing).

**Before building anything:** read the current Upload-Post docs and confirm endpoint names, auth header format, request fields, rate limits, and per-platform requirements. Verify the details assumed in this brief against the docs, and note any differences in a short `docs/SOCIAL_PROVIDER_NOTES.md`.

---

## 0. Spike first (half a day) — confirm platform support
Using the Upload-Post free plan, build a throwaway script or admin-only test page that:
- Creates a user profile, generates a white-label connect URL, and connects a test **Facebook Page**, **Instagram Business** account, and **Google Business Profile**.
- Publishes a text post, a photo post, and (if supported) a Google Business Profile post.
- Records results in `docs/SOCIAL_PROVIDER_NOTES.md`.

Known from Upload-Post's site: Google Business is a supported platform, and one Upload-Post "profile" = one client, holding one account per platform (e.g. one Facebook Page, one Instagram, one Google Business Profile). A client needing two accounts on the same platform (e.g. two locations) needs a second profile — model `social_profiles` so a client can have more than one profile in the future, but default to one.

**If Google Business Profile posting fails in the spike anyway,** stop and flag it to Andrew before continuing (the fallback provider is Zernio; the interface below must make that a provider swap, not a rewrite).

---

## 1. Scope (v1)
1. Provider module (`SocialProvider` interface + `UploadPostProvider` implementation)
2. Database tables + RLS
3. "Connect your social accounts" flow (white-label)
4. Post composer with per-platform previews and media upload
5. AI post generation (Claude)
6. Content calendar + post list
7. Scheduling + publishing queue with retries
8. Approval workflow (for done-for-you plans)
9. Post status, live links, and basic analytics
10. Plan gating + Stripe add-on
11. Postmark notifications
12. Monthly report hook

**Platforms v1:** Facebook, Instagram, Google Business Profile, LinkedIn (company page). Show TikTok, YouTube, Pinterest, Threads etc. only if the spike confirms they work. Skip X in v1.

**Out of scope (v1):** comments/DM inbox, paid ads, video editing, competitor tracking.

---

## 2. Provider interface
```ts
interface SocialProvider {
  createProfile(clientId: string): Promise<{ providerProfileId: string }>
  getConnectUrl(providerProfileId: string, opts: {
    redirectUrl: string, platforms: Platform[], logoUrl: string, title: string
  }): Promise<{ url: string, expiresAt: Date }>
  listConnectedAccounts(providerProfileId: string): Promise<ConnectedAccount[]>
  publish(input: {
    providerProfileId: string, platforms: Platform[],
    text: string, perPlatformText?: Partial<Record<Platform, string>>,
    media?: MediaItem[], link?: string, title?: string
  }): Promise<{ providerJobId: string }>
  getStatus(providerJobId: string): Promise<PublishResult[]> // per platform: status, url, error
  getAnalytics?(providerProfileId: string, range: DateRange): Promise<AnalyticsRow[]>
  // Google Business reviews (used by REVIEWS_BRIEF.md)
  listGoogleReviews(providerProfileId: string, opts?: { pageSize?: number, pageToken?: string }):
    Promise<{ reviews: ProviderReview[], nextPageToken?: string }>
  replyToGoogleReview(providerProfileId: string, reviewId: string, comment: string): Promise<void>
  deleteProfile(providerProfileId: string): Promise<void>
}
```
- `UploadPostProvider` implements it. API key in env (`UPLOAD_POST_API_KEY`), server-side only, never exposed to the browser.
- One Upload-Post user profile per SitoMax client. Store the mapping.
- **Provider decision (final for v1): Upload-Post** for social posting AND Google Business reviews (list + reply, via `/api/uploadposts/google-business/reviews` and `/reviews/reply` — confirm in docs). Upload-Post bills per client profile, not per connected account, so it is the lowest-cost option. Upload-Post has no review webhooks, so new reviews are found by polling (see REVIEWS_BRIEF.md). **Zernio** is the documented fallback/future option (review webhooks, comment/DM inbox, Google hours updates, phone/SMS); keep the interface provider-agnostic so a `ZernioProvider` can be added later without UI changes.
- White-label connect URLs expire (per Upload-Post docs, currently 48 hours). Always generate a fresh one when the client clicks "Connect".
- Wrap every call with timeouts, structured error mapping (auth expired, rate limited, media invalid, platform rejected, unknown), and logging to `social_provider_logs`.

---

## 3. Data model

### `social_profiles`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| client_id | uuid fk unique | tenant key |
| provider | text | `upload_post` (later `zernio`) |
| provider_profile_id | text | |
| created_at | timestamptz | |

### `social_accounts`
One per connected network account.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| client_id | uuid fk | |
| platform | text | `facebook` \| `instagram` \| `google_business` \| `linkedin` \| ... |
| display_name | text | page/account name |
| avatar_url | text null | |
| status | text | `connected` \| `needs_reconnect` \| `disconnected` |
| last_synced_at | timestamptz | |

Sync this from `listConnectedAccounts` after the connect redirect, on the Social page load (debounced), and nightly.

### `social_posts`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| client_id | uuid fk | |
| created_by | uuid | user (client or super admin) |
| source | text | `manual` \| `ai` \| `blog_share` \| `review_share` \| `promo` |
| source_ref_id | uuid null | e.g. blog post id |
| base_text | text | |
| per_platform_text | jsonb | overrides by platform |
| link_url | text null | |
| platforms | text[] | target platforms |
| status | text | `draft` \| `pending_approval` \| `approved` \| `scheduled` \| `publishing` \| `published` \| `partially_published` \| `failed` \| `cancelled` |
| scheduled_at | timestamptz null | stored UTC; display in client's time zone |
| published_at | timestamptz null | |
| approval_note | text null | |
| created_at, updated_at | timestamptz | |

### `social_post_media`
`id, post_id, storage_path, mime_type, width, height, duration_s, sort_order`
Media lives in a Supabase Storage bucket `social-media` at `{client_id}/{post_id}/...`.

### `social_post_targets`
One row per post × platform (results tracked per platform).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| post_id | uuid fk | |
| platform | text | |
| status | text | `queued` \| `publishing` \| `published` \| `failed` |
| provider_job_id | text null | |
| live_url | text null | link to the live post |
| error_code, error_message | text null | human-readable message for the UI |
| attempts | int | |
| published_at | timestamptz null | |

### `social_post_metrics` (if analytics available)
`id, target_id, captured_at, impressions, reach, likes, comments, shares, clicks`

### `social_provider_logs`
`id, client_id, action, request_summary jsonb, response_summary jsonb, ok bool, created_at` (no secrets, no tokens).

### RLS
- Super admin: full access.
- Client users: read/write their own `social_posts`, `social_post_media`; read their own `social_accounts`, `social_post_targets`, `social_post_metrics`. No access to `social_profiles.provider_profile_id` or logs.
- All provider calls happen server-side.

---

## 4. Connect flow (white-label)
**Entry:** Dashboard → Social → "Connect your accounts" (also a step in the onboarding checklist alongside "Connect your profiles" from LISTINGS_BRIEF.md).

1. Client clicks **Connect accounts**.
2. Server ensures a `social_profiles` row exists (creates the Upload-Post profile if not), then requests a fresh white-label connect URL with SitoMax logo, title "Connect your social accounts to SitoMax", allowed platforms, and redirect back to `/social/connected`.
3. Client connects accounts on the provider's branded page and returns.
4. `/social/connected` syncs `social_accounts` and shows success cards per platform.
5. Show clear pre-connect tips per platform:
   - Instagram: must be a Business or Creator account linked to a Facebook Page.
   - Facebook: you'll choose which Page to connect.
   - Google: you must be an Owner or Manager of the Business Profile.
6. **Reconnect handling:** if a publish fails with an auth error or a sync shows a disconnected account, set `needs_reconnect`, show a red banner on the Social page, and email the client (Postmark) with a one-click "Reconnect" link.

---

## 5. Composer
**Entry:** Social → "Create post", or from the calendar (click a day), or "Share" buttons elsewhere in SitoMax.

- **Platform picker:** toggles with platform icons for each connected account; disabled with a tooltip if not connected.
- **Base text** editor with emoji, character counters per selected platform, hashtag helper.
- **Per-platform tabs** to override text (e.g. shorter for Google, hashtags for Instagram).
- **Media:** drag-and-drop images (and video if supported), reorder, crop to the platform's recommended aspect ratios, client-side compression, validation per platform (e.g. Instagram requires media; size/format limits from the provider notes).
- **Link field** (with Google Business Profile call-to-action button type if supported: Learn more / Call / Book / Order).
- **Live previews:** realistic mock previews per platform showing avatar, name, text, media, and link — this is a key "premium" moment; make it look like the real feed.
- **Actions:** Save draft · Schedule (date/time picker, client's time zone, "Best time" suggestions as simple defaults like Tue–Thu 11am) · Post now · Submit for approval (when required by plan/role).
- Validation errors appear inline per platform before submit, not after a failed publish.

---

## 6. AI post generation (Claude)
- **"Write with AI"** button in the composer: inputs = goal (promote service / announce offer / share tip / holiday / event), tone (friendly / professional / fun), optional notes. Uses the client's business profile (name, services, city, brand voice if stored) as context.
- Returns 3 options with per-platform variants and suggested hashtags; client picks one and edits.
- **Auto-generate from content:** when a client publishes a blog post, offer "Share to social" with an AI-written post prefilled with the blog link and featured image. Same for 5-star reviews (if reviews exist) and promos.
- **Monthly content plan (done-for-you plans):** admin can click "Generate month" to create ~12 draft posts across the month for a client (mix of tips, services, promos, seasonal), landing as `pending_approval`.
- Call Claude server-side only. Keep prompts in one file. Store the generated text in `social_posts`; don't store prompts with client secrets.

---

## 7. Calendar + post list
- **Calendar:** month and week views, posts as chips with platform icons and a status color; drag a scheduled post to reschedule (updates `scheduled_at`); click to open in the composer.
- **List view** with filters: Scheduled · Drafts · Pending approval · Published · Failed.
- **Post detail:** per-platform status rows with **"View post ↗"** links (`live_url`, opens in a new tab), error messages in plain English with a "Retry" button, and metrics if available.
- Empty states with a friendly illustration and "Create your first post" / "Let AI write your first post".

---

## 8. Scheduling + publishing queue
SitoMax schedules; the provider publishes immediately when we call it. (Do not depend on provider-side scheduling, so edits, cancels, and drag-to-reschedule stay simple.)

- **Vercel Cron every minute** → `/api/social/publish-due`:
  1. Select posts with `status = scheduled` and `scheduled_at <= now()`, lock them (`publishing`) to avoid double sends (use a DB-level atomic update / `FOR UPDATE SKIP LOCKED` via an RPC).
  2. For each, call `provider.publish` once with all platforms (or per platform if per-platform text/media requires it), store `provider_job_id` on each target.
- **Vercel Cron every 5 minutes** → `/api/social/sync-status`: for targets in `publishing`, call `getStatus`, set `published` + `live_url` or `failed` + error.
- **Retries:** transient errors (timeouts, rate limits, 5xx) retry with backoff up to 3 attempts. Auth errors → `needs_reconnect`, no retry. Validation errors → `failed` with a clear message.
- Roll up target results into the post status: all published → `published`; some failed → `partially_published`; all failed → `failed`.
- "Post now" goes through the same publish function (no separate code path).
- Shared write path: one server function `updatePostTargets(postId, results)`.

---

## 9. Approvals (done-for-you)
- Plan/config flag `requires_client_approval` (on for done-for-you social plans where SitoMax writes the posts).
- Posts created by the super admin for such clients go to `pending_approval`.
- Client sees an **"Approve posts"** queue: card per post with preview, Approve / Request changes (with note) / Edit. Bulk "Approve all".
- Optional per-client setting: auto-approve if no response within N days (default off).
- Approved posts with a `scheduled_at` become `scheduled`.

---

## 10. Plans, gating, billing
Config file keyed by plan (not hard-coded):
- `social_enabled` (bool)
- `max_connected_accounts`
- `max_scheduled_posts_per_month`
- `ai_generations_per_month`
- `done_for_you` (bool) + `posts_per_month_included`
- `requires_client_approval` (bool)

Suggested packaging (Andrew decides prices): DIY Social included in Premium or as an add-on; Done-For-You Social as a separate higher-priced add-on. Use Stripe products/prices from env/config; gating reads the client's active subscription items.

Track Upload-Post profile usage against our Upload-Post plan's profile limit; alert the super admin by email at 80% so we can upgrade the plan before hitting the cap.

---

## 11. Notifications (Postmark, from info@sitomax.com)
- Client: account needs reconnect; post failed (with reason + retry link); posts awaiting approval (daily digest, only if any); weekly summary optional.
- Super admin: publish failures across clients (daily digest); approaching Upload-Post profile limit; client requested changes on a done-for-you post.

---

## 12. Monthly report hook
Helper `getSocialSummary(clientId, periodStart, periodEnd)` → posts published by platform, top post (by engagement if metrics available), total reach/likes if available. The monthly results email calls it when present.

---

## 13. Design spec — upscale, modern, polished (this is a selling feature)

The Social area must feel like a premium standalone product (quality bar: Linear, Later, Buffer, Notion, Stripe Dashboard), not a form bolted onto an admin panel. It must match and elevate SitoMax's existing premium look (Showcase / Clarity / Studio). Mobile-first: many business owners will use this on their phone.

### 13.1 Design principles
1. **Calm and spacious:** generous whitespace, few borders, one clear primary action per screen.
2. **Content first:** the client's posts and images are the hero; chrome stays quiet.
3. **Feels alive:** subtle motion, instant feedback, optimistic updates. Nothing feels "stuck."
4. **Confidence:** the client always knows what's scheduled, what's live, and what needs them.
5. **Consistency:** reuse the dashboard's design tokens and components; extend them, don't fork them.

### 13.2 Visual system (extend the existing tokens)
- **Typography:** use the dashboard's font. Clear hierarchy: page title 28–32px semibold, section titles 18–20px semibold, body 15–16px, meta 12–13px muted. Tabular numbers for stats.
- **Spacing:** 4/8px scale; cards with 20–24px padding; 24–32px gaps between sections.
- **Surfaces:** cards with 12–16px radius, 1px hairline border (low-contrast), very soft shadow; elevated shadow only on hover/drag/modals.
- **Color:** neutral base (near-white / near-black in dark mode), one brand accent for primary actions, semantic colors only for status. Use soft tinted backgrounds for chips and banners, never large saturated blocks.
- **Platform branding:** official platform glyphs (SVG, monochrome by default, brand color on hover/active), used consistently at 16/20/24px. Never stretch or recolor logos incorrectly.
- **Icons:** one icon set (e.g. Lucide) at consistent stroke width.
- **Dark mode:** fully supported if the dashboard supports it; test previews and chips in both modes.

### 13.3 Screens

**A. Social Home (overview)**
- **Header:** "Social" title, short subtitle ("Plan, create and publish to all your channels"), primary button **Create post**, secondary **✨ Write with AI**.
- **Connected accounts strip:** pill cards with account avatar + platform badge overlay + name; status dot (green connected, amber needs attention, gray not connected). Final card is **+ Connect** (dashed outline). Horizontal scroll on mobile.
- **Stat tiles (4):** Scheduled this week · Published this month · Pending approval · Total reach (if analytics). Big number, small label, tiny sparkline or delta ("+3 vs last month").
- **Up next:** timeline of the next 5 scheduled posts: time, platform icons, thumbnail, first line of text, status chip; tap to open.
- **Needs your attention:** only shown when relevant — failed posts, reconnects, approvals — as a soft amber/red card with clear actions.
- **Recently published:** small grid of the last 6 posts with thumbnails, platform icons and **View ↗** links.
- **Inspiration card (optional):** "Ideas for this week" with 3 AI-suggested post ideas tied to the season or the client's services; one tap opens the composer prefilled.

**B. Composer (create/edit)**
- **Desktop:** full-height two-pane layout (editor ~55%, live preview ~45%) in a focused full-screen view with a minimal top bar (Close · post status · autosave indicator "Saved").
- **Mobile:** full-screen sheet; editor on top, a "Preview" toggle, and a **sticky bottom action bar** (Save draft · Schedule ▾ · Post now).
- **Channel selector:** row of avatar toggles for connected accounts; selected = full color with check ring, unselected = grayscale. Disabled ones show "Connect" on tap.
- **Editor:** large comfortable text area, auto-growing; toolbar for emoji, hashtags, link, **✨ AI rewrite** (shorter / friendlier / more professional / add call to action). Per-platform character ring counter that turns amber near limit and red over limit.
- **Per-platform tabs:** "All channels" plus a tab per selected platform; a small dot on tabs with custom overrides.
- **Media tray:** drag-and-drop zone with a clean empty state; thumbnails with reorder handles, crop button (aspect presets per platform: 1:1, 4:5, 16:9, 9:16), remove; upload progress rings; alt text field.
- **Scheduling popover:** calendar + time picker, client's time zone shown, quick picks ("Tomorrow 9am", "Next Tue 11am", "Best time ✨"), and a preview line "Publishes Tue, Mar 4 at 11:00 AM CST".
- **Inline validation:** per-platform issues listed above the action bar with a fix link ("Instagram needs an image — Add image").

**C. Live previews (key premium moment)**
- Pixel-faithful mock-ups of a real post for each platform: Facebook feed post, Instagram feed post (square/portrait media, carousel dots), Google Business Profile update (with CTA button), LinkedIn company post. Include the client's real avatar and name, "Just now" timestamp, realistic engagement row (greyed placeholders), and truncation behavior ("…See more") matching the platform.
- Preview updates live as the user types (debounced ~150ms).
- Device frame toggle (phone / desktop) for the active preview.

**D. Calendar**
- **Month and week views** with a segmented control; "Today" button; arrows for navigation; month title large and clean.
- **Post chips:** thumbnail (if media), time, platform icon stack, colored left accent bar by status. Hover shows a mini preview card.
- **Drag-and-drop** to reschedule with a ghost card and drop-target highlight; optimistic update + undo toast ("Moved to Thu 10:00 AM · Undo").
- **Click an empty slot** → composer prefilled with that date/time.
- **Week view:** time grid with 30-minute rows, current-time line.
- **Mobile:** agenda/list view by default (grouped by day, sticky day headers) with a month mini-calendar at the top.

**E. Posts list**
- Tabs with counts: Scheduled · Drafts · Pending approval · Published · Failed.
- Rows/cards: thumbnail, text excerpt (2 lines), platform icons with per-platform status dots, date/time, actions menu (Edit, Duplicate, Reschedule, Delete).
- Search and filter by platform.

**F. Post detail**
- Large preview on the left; on the right a **per-platform status panel**: platform, status chip, published time, **View post ↗** (opens in new tab), metrics (likes, comments, reach) as small stat chips, and for failures a plain-English explanation with **Retry** and **Fix** buttons.
- Activity timeline: created → approved → scheduled → published per platform.

**G. Approvals (done-for-you clients)**
- Swipe-friendly card stack on mobile, grid on desktop. Each card: full preview, scheduled time, **Approve** (primary), **Request changes** (opens a note field), **Edit**.
- Sticky header with "12 posts to review" and **Approve all**.
- Celebratory micro-moment when the queue is cleared ("You're all set for March 🎉").

**H. Connect accounts**
- Grid of platform cards: logo, name, one-line benefit ("Reach customers searching on Google"), status, and a **Connect** button.
- Pre-connect tips in a small expandable "Before you connect" section per platform.
- Success state: confetti-free, elegant check animation and the connected account's avatar and name.

### 13.4 Components & states
- **Status chips** (icon + text, never color alone): Draft (gray, pencil) · Pending approval (violet, hourglass) · Scheduled (blue, clock) · Publishing (blue, spinner) · Published (green, check) · Partially published (amber, half-circle) · Failed (red, alert).
- **Loading:** skeletons that match final layouts (cards, calendar cells, previews). No full-page spinners.
- **Empty states:** tasteful illustration or icon composition + one-line headline + one primary action. Examples: "Nothing scheduled yet — let AI plan your week" · "Connect your first account to start posting."
- **Errors:** inline and human ("Instagram didn't accept this image. Images must be under 8MB."), with a next step.
- **Toasts:** bottom-center on mobile, bottom-right on desktop, auto-dismiss 4s, with Undo where possible.
- **Modals/sheets:** sheets on mobile, centered modals on desktop, focus-trapped, close on Esc.

### 13.5 Motion
- 150–250ms ease-out for hovers, chips, sheets; 300ms for page-level transitions.
- Subtle scale (0.98) on press; soft lift on hover for cards.
- Stat numbers count up on first load.
- Respect `prefers-reduced-motion` (disable non-essential animation).

### 13.6 Responsiveness & performance
- Breakpoints: mobile (<640px), tablet (640–1024px), desktop (>1024px). Test at 375px, 768px, 1280px, 1440px.
- Touch targets ≥ 44px. No horizontal page scroll (only intentional carousels).
- Images: lazy-load, responsive sizes, blurred placeholders.
- Calendar month view renders smoothly with 200+ posts.
- Lighthouse (dashboard pages): Performance ≥ 85, Accessibility ≥ 95.

### 13.7 Accessibility
- WCAG AA contrast in light and dark modes.
- Full keyboard support: composer, calendar (arrow keys to move focus between days, Enter to open), drag-and-drop has a keyboard alternative ("Move to…" menu).
- Visible focus rings; ARIA labels on icon-only buttons; status announced to screen readers on publish/fail.

### 13.8 Quality gate (do before marking done)
- Build each screen, then take screenshots at 375px and 1440px in light and dark mode and save them to `docs/screenshots/social/`.
- Self-review against this spec and fix any gaps: alignment, spacing consistency, truncation, empty/loading/error states, long text, very long business names, missing avatars (fallback to initials), 0 and 200+ posts.
- Use realistic seed data (a sample bakery/plumber client with real-looking posts and images) for screenshots; never lorem ipsum.

---

## 14. Security
- Upload-Post API key server-side only (env var), never in client bundles or logs.
- Verify the requesting user belongs to the client before any provider call.
- Validate and size-limit uploads; strip EXIF location data from images.
- Rate-limit "Post now" and AI generation endpoints per client.

---

## Acceptance criteria
- [ ] Spike completed and `docs/SOCIAL_PROVIDER_NOTES.md` documents confirmed endpoints and platform support (incl. Google Business Profile).
- [ ] All Upload-Post calls are inside `UploadPostProvider`; nothing else imports it except via `SocialProvider`.
- [ ] Client can connect Facebook, Instagram, and Google Business Profile via a SitoMax-branded connect page and see them as connected.
- [ ] Composer supports per-platform text, media validation, live previews, drafts, scheduling, and post now.
- [ ] AI generates 3 post options from the client's business context; "Share to social" works from a published blog post.
- [ ] Calendar shows posts with statuses; drag-to-reschedule works.
- [ ] Scheduled posts publish within ~1–2 minutes of their time; no double posting under concurrent cron runs.
- [ ] Per-platform results show live links or plain-English errors with retry; post status rolls up correctly.
- [ ] Auth failures set `needs_reconnect`, show a banner, and email the client a reconnect link.
- [ ] Approval workflow works for done-for-you clients (approve, request changes, bulk approve).
- [ ] Plan gating and limits come from config; super admin gets an alert at 80% of the Upload-Post profile limit.
- [ ] Postmark notifications fire as specified.
- [ ] UI meets the design spec (section 13) on mobile and desktop, in light and dark mode.
- [ ] Platform previews look like real Facebook, Instagram, Google Business Profile and LinkedIn posts and update live while typing.
- [ ] Every screen has polished loading (skeleton), empty, and error states.
- [ ] Screenshots at 375px and 1440px (light + dark) saved in `docs/screenshots/social/` using realistic seed data.
- [ ] Lighthouse: Performance ≥ 85, Accessibility ≥ 95 on Social pages.