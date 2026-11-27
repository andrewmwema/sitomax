# BOOKING_BRIEF.md — Online Booking & Appointments

## Goal
A built-in, Calendly-quality booking system for SitoMax client websites. Visitors book services directly on the client's site (under the client's brand), get confirmations and reminders, and every booking appears in the owner's SitoMax calendar and Leads inbox. No third-party scheduling service.

Builds on what already exists:
- **Leads inbox / light CRM** (leads, `lead_events`, `lead_messages`, statuses, Postmark replies, notifications).
- **`sites.business`** (name, phone, address, hours) and **`sites.timezone`**.
- `lib/email` (Postmark), Stripe (platform billing), section library, credits/`ai_usage`, RLS by account membership, sanitizer.
- Related briefs: CHAT_BRIEF.md ("Book a call"), REVIEWS_BRIEF.md (review request after completion), LISTINGS_BRIEF.md / Google Business Profile ("Book" button link).

Work in phases. After EACH phase: build, lint, typecheck, tests, commit "Booking phase X: …", push, STOP and summarise. Migrations use the next free number; remind Andrew to run them in the Supabase SQL Editor.

**Core rules**
1. **No double bookings, ever** — enforced in the database, not just the UI.
2. **Time zones are always correct**, including daylight-saving changes. Store all times as UTC `timestamptz`; availability rules are defined in the business's time zone; visitors see times in their own time zone with the business zone clearly labeled.
3. Never show a slot that isn't actually bookable at submit time (re-validate server-side).

---

## PHASE A — Data model + availability engine

### A1. Data (migration)
Enable `btree_gist` for exclusion constraints.

**`booking_settings`** (one per site)
| column | type | notes |
|---|---|---|
| site_id | uuid pk/fk | |
| enabled | bool | default false |
| timezone | text | defaults to `sites.timezone` |
| booking_page_slug | text | default `book` → `/book` |
| min_notice_minutes | int | default 1440 (24h) |
| max_days_ahead | int | default 60 |
| slot_interval_minutes | int | default 30 (start-time granularity) |
| max_bookings_per_day | int null | |
| require_phone | bool | default true |
| custom_questions | jsonb | array of {id, label, type: text/textarea/select/checkbox, options?, required} |
| confirmation_mode | text | `instant` \| `request` (owner approves) |
| cancellation_policy_text | text null | shown before booking |
| allow_reschedule, allow_cancel | bool | default true |
| reschedule_cutoff_hours, cancel_cutoff_hours | int | default 24 |
| reminder_schedule | int[] | hours before: default {24, 2} |
| calendar_feed_token | text unique | for the private iCal subscription URL (rotatable) |
| notify_emails | text[] | defaults to site notification email |

**`booking_services`**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| site_id | uuid fk | |
| name, description | text | |
| duration_minutes | int | |
| buffer_before_minutes, buffer_after_minutes | int | default 0 / 15 |
| price_cents | int null | display price (null = "Free" or hidden) |
| price_display | text | `free` \| `fixed` \| `starting_at` \| `hidden` |
| deposit_cents | int null | requires Stripe Connect (Phase E) |
| location_type | text | `onsite` (customer address) \| `business` \| `phone` \| `video` |
| location_details | text null | e.g. video link instructions |
| color | text | for calendar display |
| image_url | text null | |
| active | bool | |
| sort_order | int | |
| staff_ids | uuid[] null | v1: single "business" calendar; staff ready for later |

**`booking_availability`** (weekly rules, in business time zone)
`id, site_id, weekday (0–6), start_time time, end_time time` (multiple ranges per day allowed, e.g. 9–12 and 13–17). Seed from `sites.business` hours when booking is first enabled.

**`booking_exceptions`** (date overrides)
`id, site_id, date, type ('closed' | 'custom_hours'), start_time null, end_time null, note`. Include a "Holidays" quick-add (US federal holidays list for the year, client picks which).

**`booking_blocks`** (owner busy times / time off, one-off ranges)
`id, site_id, starts_at timestamptz, ends_at timestamptz, reason, created_by`.

**`bookings`**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| site_id | uuid fk | |
| service_id | uuid fk | |
| lead_id | uuid fk null | linked lead |
| status | text | `pending` (awaiting approval/payment) \| `confirmed` \| `cancelled` \| `completed` \| `no_show` \| `rescheduled` |
| starts_at, ends_at | timestamptz | appointment time |
| block_range | tstzrange | starts_at − buffer_before to ends_at + buffer_after (generated or maintained) |
| customer_name, customer_email, customer_phone | text | |
| customer_timezone | text | |
| customer_address | text null | for onsite services |
| answers | jsonb | custom question answers |
| notes_internal | text null | owner-only |
| source | text | `booking_page` \| `site_section` \| `chat` \| `admin` \| `google` (utm/ref) |
| manage_token | text unique | for customer reschedule/cancel links (≥128-bit random) |
| deposit_status | text | `none` \| `pending` \| `paid` \| `refunded` \| `failed` |
| stripe_payment_intent_id | text null | |
| cancelled_reason | text null | |
| cancelled_by | text null | `customer` \| `owner` |
| rescheduled_from_id | uuid null | |
| reminders_sent | jsonb | e.g. {"24": "2026-…", "2": "…"} |
| created_at, updated_at | timestamptz | |

**Double-booking protection:** exclusion constraint on `bookings` — `EXCLUDE USING gist (site_id WITH =, block_range WITH &&) WHERE (status IN ('pending','confirmed'))`. (When staff are added later, switch the key to staff_id.) Pending bookings hold the slot for at most 15 minutes (expire unpaid/unapproved holds via cron for paid flow; request-mode pending holds until approved/declined).

RLS: account members manage their site's booking data; super admin all. Public access only via server routes (slots, create booking, manage by token).

### A2. Availability engine
One pure, well-tested function: `getAvailableSlots(siteId, serviceId, fromDate, toDate, visitorTz)` →
1. Expand weekly rules into concrete ranges per date in the business time zone (DST-safe; use a robust date library such as Luxon or date-fns-tz).
2. Apply exceptions (closed / custom hours).
3. Subtract `booking_blocks`, existing pending/confirmed bookings (with their buffers), and min-notice window; cap at max days ahead and max bookings per day.
4. Generate start times at `slot_interval_minutes` where `duration + buffers` fits entirely.
5. Return slots in UTC plus labels in the visitor's time zone and the business time zone.

Unit tests must cover: DST spring-forward/fall-back days, overlapping buffers, back-to-back bookings, exceptions, min notice crossing midnight, visitor in a different time zone (including one where the date differs), max per day.

### A3. Public API
- `GET /api/booking/{siteId}/services` → active services.
- `GET /api/booking/{siteId}/slots?serviceId&from&to&tz` → available days + slots (cache 30–60s; never trusted at submit).
- `POST /api/booking/{siteId}/book` (Turnstile-verified, reuse grader/chat setup) → re-validates the slot inside a transaction; the exclusion constraint is the final guard (on conflict return a friendly "That time was just taken" + fresh nearby slots).
- `GET/POST /api/booking/manage/{token}` → view, reschedule, cancel within policy.
- Rate limits per IP; honeypot field; validate email/phone.

---

## PHASE B — Public booking experience (premium design)

### B1. Entry points
- **Booking page** at `/{booking_page_slug}` on the client's site (inherits site header/footer and theme).
- **"Book now" section block** in the section library with 3 variants: **Inline scheduler** (full flow embedded in the page), **Service cards** (grid of services, each opening the flow), **CTA band** (headline + button opening the flow in a modal/sheet).
- **Global "Book" button** option in site header settings.
- Deep links: `/book?service={id}` and `?ref=chat|google|email` for attribution.

### B2. Design spec — upscale, modern, polished (this is a selling feature)
Quality bar: Calendly, Cal.com, SavvyCal, Linear-level polish. The flow must make the client's business look premium and be effortless on a phone.

**Theming (auto from the site, like the chat widget)**
- Site font, accent color (with computed hover/pressed shades, a soft tint, and an accessible on-accent text color), radius style, and light/dark mode.
- Scoped styles so site CSS never breaks the scheduler.

**Layout**
- **Desktop (≥ 1024px):** elegant three-column card (max ~1040px wide):
  1. **Left — summary rail:** business logo/avatar, business name, selected service name, duration (clock icon), location type (icon + text), price/deposit, short description, time zone selector.
  2. **Middle — calendar:** month view.
  3. **Right — time slots** for the selected day.
- **Tablet:** two columns (summary + calendar, slots below).
- **Mobile:** single column stepper with a slim progress indicator (Service → Date → Time → Details → Confirm), sticky bottom bar showing the current selection and the primary action, back button in the header. Each step fills the screen comfortably; no tiny targets.

**Step 1 — Choose a service**
- Service cards (image optional) with name, duration chip, price or "Free", location icon, 2-line description, and a chevron. Hover lift on desktop; selected state with accent ring and check.
- If only one service exists, skip this step.

**Step 2 — Pick a date**
- Clean month calendar: weekday headers, large tappable day cells (≥ 44px), **available days bold with a small accent dot**, unavailable days muted (not clickable), today outlined, selected day filled with the accent color.
- Month navigation arrows; jump to the first available day automatically; if a month has no availability, show "No openings in March — see April" with a button.
- Skeleton shimmer while loading availability; prefetch the next month.

**Step 3 — Pick a time**
- Selected date as a heading ("Thursday, March 12").
- Slots as pill buttons in a responsive grid (2 columns mobile, 1–2 desktop), grouped under **Morning / Afternoon / Evening** subheadings.
- Two-tap confirm pattern on desktop: click a slot → it expands into the slot + a "Next" button (like Calendly). On mobile, tapping a slot highlights it and enables the sticky "Continue" button.
- Time zone line: "Times shown in Central Time (CST) · Change" with a searchable time zone picker; if the visitor's zone differs from the business zone, show a subtle note ("The business is in Central Time").
- "Only 2 times left this day" subtle hint when applicable (true data only).

**Step 4 — Your details**
- Elegant form: Name, Email, Phone (auto-format, country code), address field (onsite services, with simple autocomplete if available, otherwise plain), custom questions, optional "Anything we should know?" textarea.
- Floating labels, inline validation, clear required markers, autofill-friendly attributes.
- Cancellation policy and deposit info shown in a calm info card above the button.
- Primary button: "Confirm booking" or "Pay $50 deposit & book" (Phase E).

**Step 5 — Confirmation (delight moment)**
- Animated success check (≈400ms), headline "You're booked!" (or "Request sent!" in request mode), appointment summary card (service, date, time in their zone, location, business contact), and action buttons: **Add to Google Calendar**, **Add to Apple / Outlook (.ics)**, **Reschedule**, **Cancel**.
- "A confirmation has been sent to sam@email.com."
- Optional upsell slot for the business (e.g. "Follow us on Instagram") from settings.

**Manage booking page** (`/book/manage/{token}`)
- Same polished card: current appointment summary, Reschedule (reuses the date/time steps), Cancel (with optional reason and policy reminder), and contact business buttons. Clear messaging when outside the reschedule/cancel cutoff.

**Motion**
- Step transitions: horizontal slide + fade (220ms); slot grid fades in (150ms, 20ms stagger); calendar month change crossfade.
- Respects `prefers-reduced-motion`.

**Accessibility**
- Calendar is a proper grid with arrow-key navigation, Enter to select, ARIA labels ("Thursday March 12, 5 times available").
- Slots are buttons with full labels; live region announces loading and selection.
- Focus management between steps; visible focus rings; WCAG AA contrast with any accent color; 44px touch targets.

**Performance**
- Booking page Lighthouse: Performance ≥ 90, Accessibility ≥ 95.
- Slots API responds < 300ms typical (cached); no layout shift when slots load.

**Empty/edge states**
- Booking disabled → friendly message with phone/contact.
- No availability in range → "No openings right now" + "Leave your details and we'll reach out" (creates a lead).
- Slot taken at submit → gentle message and refreshed nearby times without losing entered details.

---

## PHASE C — Notifications, reminders, calendar files & feed

### C1. Emails (Postmark, transactional stream `bookings`)
Beautiful branded HTML emails (business logo, accent color, clean summary card, big buttons), each with a plain-text version:
- **Customer:** confirmation (with .ics attachment), request received (request mode), approved/declined, rescheduled (updated .ics, same UID with incremented SEQUENCE), cancelled (CANCEL .ics), reminders per `reminder_schedule` (with reschedule/cancel links and directions/call buttons), and a post-appointment "Thank you" (optional; review request handled by REVIEWS_BRIEF.md).
- **Owner:** new booking (with customer details, answers, add-to-calendar .ics), booking request to approve (Approve / Decline buttons via signed links), cancellations and reschedules, daily agenda email (optional, at 7am business time).

### C2. Reminders
- Vercel Cron every 5 minutes → send due reminders (idempotent; record in `reminders_sent`). Skip cancelled/completed bookings.
- SMS reminders: leave a provider-agnostic `sendSms` hook (no-op unless an SMS provider is configured later).

### C3. Calendar files & subscription feed
- Generate standards-compliant `.ics` (VEVENT with UID, DTSTART/DTEND in UTC, SUMMARY "{Service} with {Business}", LOCATION, DESCRIPTION with manage link, ORGANIZER).
- "Add to Google Calendar" uses a prefilled Google Calendar template URL (no API).
- **Private iCal feed** for the owner: `https://app.ROOT_DOMAIN/api/booking/feed/{calendar_feed_token}.ics` listing upcoming confirmed bookings (next 6 months) and recent ones (past 30 days). Settings show one-click instructions for Google Calendar, Apple Calendar, and Outlook, plus "Regenerate link" (invalidates the old one).
- Note in settings: this is one-way (bookings appear in their calendar); they block personal busy times in SitoMax. Two-way sync is a future phase.

---

## PHASE D — Owner dashboard (premium)

### D1. Calendar view (Dashboard → Bookings)
- **Views:** Day, Week (default on desktop), Month, and **Agenda** list (default on mobile).
- Week view: time grid in business time zone, 30-minute rows, current-time line, business hours shaded, blocks/time-off as hatched areas, bookings as rounded event cards colored by service (service color as left accent bar + soft tint), showing time, customer name, service, and status icon.
- Click an event → **side drawer**: customer details (copy, call, email), service, time, location, answers, deposit status, linked lead (open in inbox), internal notes, actions: Reschedule, Cancel (with optional message to customer), Mark completed, Mark no-show, Resend confirmation.
- **Drag-and-drop to reschedule** in week/day view (validates against availability; confirm dialog "Notify customer?"); optimistic UI with undo toast.
- Click empty slot → create booking manually (admin booking, choose to notify customer) or add a block/time off.
- Header: today's stats (appointments today, this week, pending approvals), date navigation, "Today" button, filters by service and status.
- Pending approvals tray (request mode) with Approve / Decline.

### D2. Setup (Bookings → Settings)
- **Onboarding wizard** when first enabling: 1) confirm time zone and hours (prefilled from business hours), 2) create first service (templates by industry: "Free estimate 30 min", "Consultation 60 min", "Service call 90 min"), 3) choose where to show booking (page, section, header button), 4) preview and publish.
- Tabs: Services (drag to reorder, color picker, duration, buffers, price, deposit, location), Availability (weekly editor with visual day rows and multiple ranges, copy hours to all days), Date overrides & holidays (calendar picker), Booking rules (notice, horizon, interval, per-day cap, confirmation mode, policies, custom questions), Notifications (reminder schedule, owner emails, daily agenda), Calendar sync (feed link + instructions).
- **Live preview** panel showing the public booking flow with real data (desktop/mobile toggle, light/dark).

### D3. Leads & CRM integration
- Each booking creates or links a lead in the Leads inbox (dedup by email/phone per site), source "Online booking", with `lead_events` for booked, rescheduled, cancelled, completed, no-show.
- Lead drawer shows upcoming/past bookings for that contact with a "Book again" action.
- **Mark completed** → triggers REVIEWS_BRIEF.md review request flow (if enabled) instead of relying only on "Won".

### D4. Insights
- Stat tiles (count-up): bookings this month, upcoming, cancellation rate, no-show rate, deposits collected.
- Charts: bookings per week, popular services, busiest days/times heat map, booking sources (booking page, chat, Google, section).
- **Monthly results email hook:** `getBookingSummary(siteId, start, end)` → booked, completed, cancelled, deposits collected. Example line: "23 appointments booked online this month."

### D5. Dashboard design
Matches the SitoMax premium dashboard style (same tokens and quality bar as SOCIAL_BRIEF.md §13): clean calendar grid, soft service colors, status chips with icon + text (Pending, Confirmed, Completed, Cancelled, No-show), skeleton loaders, friendly empty states ("No appointments yet — share your booking link"), copy-link button for the booking page, dark mode, keyboard navigation, WCAG AA.

---

## PHASE E — Deposits & payments (Stripe Connect)
Only build after Phases A–D are stable **and PAYMENTS_BRIEF.md Phases A–B are done.** All payment logic lives in the shared payments module (`lib/payments`); this phase only wires booking to it. Do not call Stripe directly from booking code.
- Stripe Connect onboarding, account status, fees, and the Payments settings page are owned by PAYMENTS_BRIEF.md (pricing model "Stripe handles pricing", direct charges, optional platform fee from plan config).
- Services with `deposit_cents` require an active payment account (`getPaymentAccount(siteId)` → `active` + `charges_enabled`); otherwise the deposit field is disabled with a "Set up payments to collect deposits" prompt linking to Settings → Payments.
- Booking flow: on "Pay & book", create a pending booking (slot hold, 15-minute expiry) and call `createPayment({ sourceType: 'booking_deposit', sourceId: bookingId, ... })`; render the shared `<SitoMaxCheckout>` component inside the booking flow's details/confirm step. The payments module's webhook handler calls the booking handler to confirm the booking on success and release the hold on failure/expiry.
- Refunds: owner-initiated from the booking drawer via `refundPayment` (full/partial); automatic refund on owner cancellation (setting); customer cancellation refund follows the policy setting (refund if cancelled ≥ X hours before).
- Show deposits in the booking drawer and insights.

---

## PHASE F — Integrations with other SitoMax features
- **AI Chat (CHAT_BRIEF.md):** "Book a call" quick action and intent detection open the booking flow inside the chat panel (compact version of the scheduler) or link to the booking page with `?ref=chat` and prefilled name/email if captured.
- **Google Business Profile:** settings show the booking page URL with instructions to add it as the Google "Book"/appointment link (and include it in the LISTINGS_BRIEF.md "Connect your profiles" checklist).
- **Social (SOCIAL_BRIEF.md):** "Share booking link" creates a prefilled post ("Now booking online!").
- **Website grader:** if a scanned site has no booking link, the report mentions online booking as a fix (copy only).
- **Document signing (SIGNING_BRIEF.md):** a service can require a document (e.g. liability waiver, intake form). Add `required_template_id` (nullable) and `waiver_timing` (`before_confirmation` | `before_appointment`) to `booking_services`. With `before_confirmation`, the booking stays `pending` until the document is completed (then auto-confirms); with `before_appointment`, the booking confirms immediately and the waiver link is included in the confirmation and reminder emails. The booking drawer shows "Waiver signed ✓" / "Waiver pending". Only available when signing is enabled for the site's plan.
- **Payments (PAYMENTS_BRIEF.md):** deposits are handled in Phase E via the shared payments module.
- **Reviews (REVIEWS_BRIEF.md):** "Mark completed" triggers the review request flow (if enabled).

---

## Plans & gating (config, not hard-coded)
- `booking_enabled` (Growth+ or add-on), `booking_max_services`, `booking_reminders`, `booking_deposits` (Premium or add-on), `booking_platform_fee_percent`, `booking_remove_branding` (Premium/white-label).

## Security & privacy
- Manage tokens and feed tokens are long random values; rotate on request.
- Turnstile + rate limits on public endpoints; honeypot on the details form.
- Sanitize all customer-entered text everywhere it's displayed (dashboard, emails, .ics).
- Never log customer details or payment data in server logs; Stripe handles card data.
- Retention: cancelled bookings without a lead purge after 1 year (configurable).

---

## Acceptance criteria
- [ ] Availability engine passes unit tests for DST, buffers, exceptions, min notice, max per day, and cross-time-zone visitors.
- [ ] Database exclusion constraint prevents double bookings under concurrent requests (test with parallel inserts).
- [ ] Public flow (service → date → time → details → confirm) works on mobile and desktop, re-validates at submit, and handles "slot just taken" gracefully.
- [ ] Booking page, Book Now section (3 variants), and header button work and inherit the site theme.
- [ ] Booking flow meets the B2 design spec (layout, calendar, slots grouped by time of day, time zone handling, confirmation with add-to-calendar, motion, accessibility); Lighthouse targets met.
- [ ] Customer and owner emails are branded and correct; .ics files import correctly into Google, Apple, and Outlook (including reschedule updates and cancellations).
- [ ] Reminders send on schedule exactly once; cancelled/completed bookings get none.
- [ ] Private iCal feed works in Google Calendar, Apple Calendar, and Outlook; regenerate invalidates the old link.
- [ ] Owner calendar (day/week/month/agenda), drawer actions, drag-to-reschedule with notify option, manual bookings, blocks, and approvals work.
- [ ] Bookings create/link leads with events; Mark completed triggers the review request flow.
- [ ] Onboarding wizard and settings with live preview work; insights and `getBookingSummary` are correct.
- [ ] Phase E: Stripe Connect onboarding, deposits with slot holds, webhooks, and refunds work in test mode.
- [ ] Screenshots of every public and dashboard state at 375px and 1440px (light + dark) on 3 templates with different accents in `docs/screenshots/booking/`, using realistic seed data.