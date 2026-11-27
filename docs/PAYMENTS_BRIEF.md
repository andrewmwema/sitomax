# PAYMENTS_BRIEF.md — Client Payments (Stripe Connect, shared module)

## Goal
Let SitoMax clients accept payments from their own customers on their SitoMax website and from the dashboard — booking deposits, invoices/quotes, "Pay now" links, and payment buttons — with money going straight to the client's own Stripe account. SitoMax never holds client funds and never touches card data.

This is a **shared payments module** used by every feature that takes money (BOOKING_BRIEF.md deposits, Leads inbox invoices, website payment buttons, and a future store). No feature talks to Stripe directly except through this module.

Builds on what already exists: SitoMax's Stripe account (platform subscription billing), Leads inbox (leads, `lead_events`, `lead_messages`), `lib/email` (Postmark), `sites.business`, section library, RLS by account membership, sanitizer.

Work in phases. After EACH phase: build, lint, typecheck, tests, commit "Payments phase X: …", push, STOP and summarise. Migrations use the next free number; remind Andrew to run them in the Supabase SQL Editor. **Everything is built and tested in Stripe test mode first.**

---

## Key decisions (confirm details in Stripe's current Connect docs before building)
1. **Pricing model: "Stripe handles pricing."** Stripe sets and collects processing fees directly from each connected account (the client), so SitoMax pays no Connect platform fees. Do NOT use the "platform handles pricing" model.
2. **Charge type: direct charges** on the connected account (the client is the merchant of record; refunds and disputes live on their account; their name appears on the customer's card statement).
3. **Connected account setup:** use Stripe's currently recommended configuration for direct charges where the connected account has its own Stripe dashboard and Stripe collects fees from it. Support both: (a) creating a new account through Stripe-hosted (or embedded) onboarding, and (b) connecting a client's **existing** Stripe account.
4. **Optional platform fee:** support an `application_fee_amount` per payment from a per-plan config (`payments_platform_fee_percent`, default 0). Confirm in docs that application fees are supported with the chosen account configuration and charge type; if not, leave the fee at 0 and flag it to Andrew.
5. **Separate from SitoMax billing:** SitoMax's own subscription billing (clients paying SitoMax) stays as is and must not be mixed with Connect code. Use separate modules, webhook endpoints, and env vars.

Write the confirmed details (account configuration, onboarding method, fee support, webhook events) into `docs/PAYMENTS_STRIPE_NOTES.md` before Phase A coding.

---

## Environment
| var | notes |
|---|---|
| `STRIPE_SECRET_KEY` | existing platform key (test + live) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | **new**, for the Connect webhook endpoint (events from connected accounts) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | existing |
| `PAYMENTS_ENABLED` | global kill switch |

Remind Andrew to: enable Connect in the Stripe dashboard, complete the platform profile and branding (SitoMax name, icon, color), set the Connect webhook endpoint, and add env vars in Vercel.

---

## PHASE A — Connect onboarding + core module

### A1. Data (migration)
**`payment_accounts`** (one per site; or per account if several sites share a business — follow existing tenancy, default per site)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| site_id | uuid fk unique | |
| stripe_account_id | text unique | `acct_…` |
| status | text | `not_started` \| `onboarding` \| `restricted` \| `active` \| `disabled` |
| charges_enabled, payouts_enabled, details_submitted | bool | mirrored from Stripe |
| requirements_due | jsonb | currently due / past due items |
| default_currency, country | text | |
| business_display_name | text null | |
| connected_via | text | `new_account` \| `existing_account` |
| created_at, updated_at | timestamptz | |

**`payments`** (every charge, regardless of source)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| site_id | uuid fk | |
| source_type | text | `booking_deposit` \| `invoice` \| `payment_link` \| `button` \| `store` |
| source_id | uuid null | booking/invoice/link id |
| lead_id | uuid null | linked contact |
| stripe_payment_intent_id | text unique | |
| stripe_charge_id | text null | |
| amount_cents, currency | int, text | |
| application_fee_cents | int | 0 by default |
| status | text | `requires_payment` \| `processing` \| `succeeded` \| `failed` \| `refunded` \| `partially_refunded` \| `disputed` \| `canceled` |
| refunded_cents | int | |
| customer_name, customer_email | text | |
| description | text | |
| receipt_url | text null | Stripe receipt |
| metadata | jsonb | |
| created_at, succeeded_at | timestamptz | |

**`payment_events`**: `id, payment_id, type, stripe_event_id unique, data jsonb, created_at` (idempotency + audit).

RLS: account members read their site's payment data; only server routes write. Super admin all.

### A2. Module API (`lib/payments/`)
One server-side module; everything else calls only these functions:
```ts
getPaymentAccount(siteId)
startOnboarding(siteId, { returnUrl, refreshUrl, mode: 'new' | 'existing' }) → { url }
syncAccountStatus(siteId)
createPayment({ siteId, amountCents, currency, sourceType, sourceId, leadId?, customer, description, metadata, captureMethod? }) → { clientSecret, paymentId }
refundPayment(paymentId, { amountCents?, reason? })
getDashboardLink(siteId) → { url }   // Stripe dashboard / login link for the client
handleConnectWebhook(event)
```
- All Stripe calls use the connected account context (`stripeAccount: acct_…`) for direct charges.
- `createPayment` refuses if the account isn't `active` with `charges_enabled`, or if `PAYMENTS_ENABLED` is off.
- Amount limits: min $1.00, max configurable (default $10,000) to reduce fraud risk.
- Idempotency keys on every create/refund call.

### A3. Onboarding UX (Settings → Payments)
- **Not connected:** hero card "Get paid online" with benefits (deposits, invoices, pay buttons), "Stripe's standard processing fees apply, paid from each payment" with a link to Stripe pricing, and two buttons: **Set up payments** (new Stripe account) and **I already use Stripe** (connect existing).
- Redirect to Stripe onboarding; on return, call `syncAccountStatus` and show the result.
- **Status card** states: Onboarding (resume button), Action needed (lists requirements in plain English + "Complete in Stripe"), Active (green, payouts enabled, currency, "Open Stripe dashboard ↗"), Disabled (contact support).
- Show the platform fee (if any) clearly: "SitoMax fee: 1% per payment (removed on Premium)."

### A4. Webhooks
- `POST /api/payments/connect-webhook`: verify signature with `STRIPE_CONNECT_WEBHOOK_SECRET`, dedupe by event id, process asynchronously-safe.
- Handle at minimum: `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `account.application.deauthorized`.
- On success/failure/refund, update `payments`, call the owning feature's handler (e.g. booking confirm/release), write `lead_events` (`payment_received`, `payment_refunded`, `payment_failed`), and send notifications.
- Deauthorized/disabled accounts → mark `disabled`, pause features needing payments, email the owner.

---

## PHASE B — Checkout experience (shared, premium)

### B1. Payment form component
- Use **Stripe Payment Element** (cards, Apple Pay, Google Pay, Link, and other methods Stripe enables for the account) with the **Appearance API** themed from the site: font, accent color, radius, light/dark, input styles matching the site's form styling.
- Reusable `<SitoMaxCheckout>` component used by booking, invoices, payment links, and buttons.
- Summary card above the form: business logo/name, item(s), amount, and any note (e.g. "Deposit applied to your final bill").
- Pay button: full-width accent, shows amount ("Pay $50.00"), loading state, disabled until complete.
- Handles 3D Secure / redirects automatically; success and failure states inline.

### B2. Design spec (upscale, modern, polished)
- Quality bar: Stripe Checkout, Apple Pay sheets, Linear-level polish; must make the client look premium and trustworthy.
- Layout: centered card (max ~480px) on mobile and desktop; on desktop invoices/links may use a two-column layout (summary left, payment right).
- Trust cues: lock icon + "Secure payment powered by Stripe", accepted card logos (subtle, monochrome), business contact link.
- **Success screen:** animated check (≈400ms), "Payment received", amount, date, reference, "View receipt ↗" (Stripe receipt), and a next-step button provided by the calling feature (e.g. "Add to calendar" for bookings).
- **Failure:** calm inline message with the reason in plain English and a retry option; never lose entered details.
- Skeleton while the Payment Element loads; no layout shift.
- Motion 150–250ms, respects `prefers-reduced-motion`; WCAG AA; 44px targets; keyboard accessible.
- Scoped styles so site CSS never breaks checkout.

---

## PHASE C — Payment links & website payment buttons

### C1. Data
**`payment_links`**: `id, site_id, slug, title, description, amount_type ('fixed' | 'customer_chooses'), amount_cents null, min_cents, max_cents, currency, image_url, collect_phone bool, collect_address bool, custom_fields jsonb, success_message, active bool, created_at`.

### C2. Features
- Dashboard → Payments → **Payment links**: create/edit links (e.g. "Pay for service call — $89", "Gift card — choose amount", "Donation"), copy link, QR code, enable/disable, see payments per link.
- Hosted page on the client's site: `/{site}/pay/{slug}` using `<SitoMaxCheckout>`.
- **"Pay" section block** in the section library (3 variants: single product card, pricing cards grid with "Pay" buttons, inline amount + pay form) and a **"Pay now" button** element that links to a payment link.
- Each successful payment creates/links a lead (source "Payment") and shows in the lead timeline.

---

## PHASE D — Invoices & quotes from the Leads inbox

### D1. Data
**`invoices`**: `id, site_id, lead_id, number (per-site sequence, e.g. INV-0001), type ('invoice' | 'quote'), status ('draft' | 'sent' | 'viewed' | 'accepted' | 'paid' | 'partially_paid' | 'void' | 'expired'), line_items jsonb [{description, qty, unit_cents}], subtotal_cents, discount_cents, tax_cents (manual tax amount or % field; no tax engine in v1), total_cents, amount_paid_cents, currency, due_date, valid_until (quotes), notes, terms, public_token, sent_at, viewed_at, paid_at, created_at`.

### D2. Features
- From a lead: **"Create quote"** / **"Create invoice"** → editor with line items (drag to reorder), saved items catalog per site, discount, tax, notes/terms, due date. Live preview of the document.
- **Send** via Postmark (branded email with "View & pay" button); also copy link and download PDF.
- **Public invoice/quote page** (`/invoice/{token}`): beautiful document-style layout with business branding, line items, totals, status badge; quotes have **Accept** (records acceptance with name + timestamp) and optional **Pay deposit**; invoices have **Pay now** (`<SitoMaxCheckout>`), partial payment optional per invoice.
- Status updates automatically from webhooks; reminders for unpaid invoices (configurable: 3 days before due, on due date, 7 days after) via Vercel Cron.
- Invoice list with filters (Draft, Sent, Overdue, Paid), totals outstanding, and paid this month.
- Converting an accepted quote into an invoice in one click.
- **Signature to accept (SIGNING_BRIEF.md):** optional per quote, "Require signature to accept". When on, the public quote page's **Accept** button opens the signing flow (a document generated from the quote's data); the quote becomes `accepted` only when signing completes (via the signing module's webhook handler), then shows **Pay deposit** if set. Only available when signing is enabled for the site's plan; otherwise the simple name-confirmation acceptance is used.
- Everything writes `lead_events` and shows in the lead's timeline.

---

## PHASE E — Payments dashboard

- Dashboard → **Payments** home: stat tiles (collected this month, outstanding invoices, refunds, number of payments), payments table (date, customer, source, amount, status chip, receipt link), filters and search, CSV export.
- Payment detail drawer: timeline (created → succeeded → refunded), customer, linked lead/booking/invoice, **Refund** (full/partial with confirmation), receipt link.
- Payouts: link to the client's Stripe dashboard (`getDashboardLink`) for payout details; optionally show recent payouts if available via API.
- Disputes: banner + email to the owner when a dispute opens, linking to Stripe to respond.
- **Monthly results email hook:** `getPaymentsSummary(siteId, start, end)` → total collected, number of payments, top source. Example: "You collected $4,820 online this month."
- Design: see **Dashboard design spec** below (applies to every Payments screen).

---

## Dashboard design spec — upscale, modern, polished (this is a selling feature)

Quality bar: **Stripe Dashboard, Mercury, Linear, Ramp.** Money screens must feel calm, precise, and trustworthy. Reuse the SitoMax dashboard tokens (same system as SOCIAL_BRIEF.md §13) and extend them; don't fork them.

### Principles
1. **Clarity over density:** the most important number on each screen is obvious within 2 seconds.
2. **Precision:** money is always formatted correctly (currency symbol, thousands separators, 2 decimals, right-aligned in tables, tabular numbers).
3. **Calm confidence:** neutral surfaces, one accent color for actions, semantic colors only for status. No alarming red unless something truly needs action.
4. **Everything actionable is one click away:** refund, resend, copy link, open lead, open in Stripe.
5. **Consistent across features:** payments, invoices, links, and booking deposits share the same components.

### Visual system
- **Typography:** dashboard font; amounts use tabular figures. Hero amounts 36–44px semibold, stat tile numbers 24–28px, table text 14px, meta 12–13px muted.
- **Cards:** 12–16px radius, hairline border, very soft shadow, 20–24px padding; 24–32px gaps between sections.
- **Status chips (icon + text, soft tinted background):** Succeeded (green, check) · Processing (blue, spinner) · Requires payment (gray, clock) · Failed (red, x) · Refunded (gray, arrow-uturn) · Partially refunded (amber) · Disputed (red, alert) · Canceled (gray). Invoices: Draft (gray, pencil) · Sent (blue, paper-plane) · Viewed (violet, eye) · Accepted (teal, thumbs-up) · Partially paid (amber) · Paid (green, check) · Overdue (red, clock) · Void (gray, slash) · Expired (gray).
- **Source badges:** Booking deposit · Invoice · Quote · Payment link · Pay button (icon + label, neutral).
- **Charts:** smooth area/line with the accent color at low opacity fill, minimal gridlines, hover crosshair tooltip with exact amount and date, no 3D, no pie charts.
- **Dark mode** fully supported; check contrast of chips and charts in both modes.
- **Icons:** one set (e.g. Lucide), consistent stroke.

### Screen A — Payments home (overview)
- **Header:** "Payments" title, subtitle "Money you've collected online", date range picker (This month ▾: Today, 7 days, 30 days, This month, Last month, This year, Custom), primary button **+ New** (menu: Payment link · Invoice · Quote).
- **Hero revenue card (full width):** large "Collected this month" amount with a count-up animation, delta vs previous period ("▲ 18% vs October", green/red subtle), and an **area chart** of daily collected amounts for the selected range. Toggle: Gross / Net of refunds.
- **Stat tiles (4):** Outstanding invoices (amount + count, links to filtered list) · Payments (count) · Average payment · Refunds (amount). Each with a tiny sparkline.
- **Needs attention** card (only when relevant): overdue invoices, disputes, failed payments, Stripe account requirements — each a row with an icon, plain-English text, and an action button.
- **Recent payments** table (last 8) with "View all →".
- **Top sources** mini-bar list (booking deposits vs invoices vs links) with amounts and percentages.
- **Account status strip** at the bottom: Stripe connected ✓ · Payouts enabled ✓ · "Open Stripe dashboard ↗".

### Screen B — Payments list
- Tabs with counts: All · Succeeded · Refunded · Failed · Disputed.
- Toolbar: search (customer, email, description, reference), filters (source, amount range, date range), **Export CSV**.
- **Table columns:** Amount (right-aligned, bold) · Status chip · Customer (name + email muted) · Source badge · Description (truncated) · Date (relative with exact on hover) · ⋯ menu.
- Row hover highlight; click opens the **detail drawer**; sticky header; pagination or infinite scroll with skeleton rows.
- **Mobile:** rows become cards (amount + status top line, customer and date below).
- Empty state: illustration/icon composition, "No payments yet", buttons "Create a payment link" and "Create an invoice".

### Screen C — Payment detail drawer (right side, 480px; full-screen sheet on mobile)
- Top: large amount, status chip, date/time, reference (copy).
- **Timeline:** Created → Authorized → Succeeded → Refunded (each with time and actor).
- Sections: Customer (name, email, phone with copy/mailto/tel, "Open lead →"), Source (linked booking/invoice/link with "View →"), Payment method (card brand icon, last 4, wallet badge), Fees (Stripe fee if available, SitoMax platform fee, net amount — clearly labeled).
- Actions: **Refund** (opens modal: full/partial amount with live validation, reason select, confirmation showing exactly what will happen), **Send receipt**, **View Stripe receipt ↗**, **Open in Stripe ↗**.
- Disputes: amber/red banner with the deadline and "Respond in Stripe ↗".

### Screen D — Invoices & quotes
- **List:** summary bar (Outstanding · Overdue · Paid this month as three compact stat pills), tabs (All · Draft · Sent · Overdue · Paid · Quotes), table (Number · Customer · Status chip · Amount · Due date · Last activity), quick actions (Send reminder, Copy link, Duplicate, Void).
- **Editor (full-screen, two-pane):**
  - Left: form — customer (search existing leads or add new), line items table with drag handles, inline editing, quantity × price with live totals, "Add from saved items", discount, tax (percent or amount), notes and terms, due date / valid until, partial payments toggle.
  - Right: **live document preview** exactly as the customer will see it (A4/Letter proportions), updating as you type; toggle Desktop / Mobile / PDF view.
  - Sticky footer: Save draft · Preview · **Send** (primary) with a send dialog showing the email preview (subject, message, "View & pay" button).
  - Autosave indicator ("Saved"), keyboard shortcuts (Tab between cells, Enter adds a row).
- **Detail view:** document preview + side panel with status timeline (Created, Sent, Viewed ×3, Partially paid, Paid), payments applied, reminders sent, actions (Send reminder, Record offline payment, Download PDF, Copy link, Convert quote → invoice, Void).

### Screen E — Public invoice / quote page (customer-facing)
- Elegant document layout on a soft background: business logo, name and contact top-left; "Invoice INV-0042" / "Quote Q-0011" with status badge top-right; bill-to; issue/due dates; line items table with clean dividers; totals block right-aligned (Subtotal, Discount, Tax, **Total** emphasized, Paid, **Amount due**).
- Sticky (mobile) / side (desktop) payment panel: amount due, **Pay now** opens `<SitoMaxCheckout>`; quotes show **Accept quote** (name confirmation) and optional **Pay deposit**.
- Paid state: large "Paid" stamp-style badge (tasteful), payment date, receipt link.
- Download PDF and Print buttons; print stylesheet produces a clean document.
- Branded to the client's site theme (accent, font); "Powered by SitoMax" small footer (removable on Premium).

### Screen F — Payment links
- Grid of link cards: image/icon, title, amount (or "Customer chooses"), active toggle, payments count and total collected, actions (Copy link, QR code, Edit, View page ↗).
- Create/edit drawer with live preview of the hosted pay page (mobile/desktop toggle).
- QR modal with download PNG/SVG and a printable card.

### Screen G — Settings → Payments (onboarding and status)
- **Not connected:** premium hero card — headline "Get paid online", 3 benefit rows with icons (Deposits for bookings · Invoices with Pay now · Payment links & buttons), fee transparency line, and two buttons (Set up payments · I already use Stripe). A small illustration/mock of a checkout on a phone.
- **Onboarding / action needed:** progress-style card listing each requirement in plain English with a "Complete in Stripe" button; reassuring copy ("Takes about 5 minutes. Stripe verifies your business securely.").
- **Active:** status card with green check, business name as it appears on statements, currency, payout status, platform fee (if any), "Open Stripe dashboard ↗", and a "Disconnect" (danger, confirm) link.
- Preferences: refund policy text, default invoice terms/notes, invoice numbering prefix, reminder schedule, receipt settings.

### Interaction & motion
- Count-up on hero amounts and stat tiles (first load only); chart draws in once (400ms).
- Drawer slides in 220ms; modals scale/fade 180ms; table rows fade in with skeleton → content.
- Optimistic UI where safe (e.g. marking reminder sent); never optimistic for money movement (refunds show a pending state until Stripe confirms).
- Toasts bottom-right (desktop) / bottom-center (mobile) with Undo where possible (not for refunds).
- Respect `prefers-reduced-motion`.

### Responsiveness & accessibility
- Breakpoints: 375px, 768px, 1280px, 1440px tested. Tables become cards on mobile; drawers become full-screen sheets; hero chart stays readable (fewer ticks).
- 44px touch targets; full keyboard support (table row navigation, drawer focus trap, Esc closes); ARIA labels for icon buttons; chart has an accessible summary and data table fallback.
- WCAG AA contrast in light and dark modes, including all status chips.

### Formatting rules
- Currency from the account's default currency; `Intl.NumberFormat` everywhere; negative amounts (refunds) shown as "−$25.00" in muted red; zero states show "$0.00", never blank.
- Dates in the business time zone with relative time in lists ("2h ago") and exact on hover; invoices show full dates.
- Long names/emails truncate with ellipsis and full text on hover; never break layouts.

### Quality gate (before marking done)
- Seed realistic data (a plumbing and a salon demo business: 60+ payments across sources, refunds, a dispute, 15 invoices in mixed states, 5 payment links).
- Screenshots of every screen and state (empty, loading, populated, error) at 375px and 1440px in light and dark mode saved to `docs/screenshots/payments/`.
- Self-review against this spec: alignment, number formatting, chip consistency, truncation, empty/loading/error states, keyboard flow; fix gaps before handing off.

---

## Integrations
- **BOOKING_BRIEF.md Phase E (deposits):** must use this module (`createPayment` with `source_type = 'booking_deposit'`, manual capture not required); booking confirm/release is triggered by the module's webhook handler.
- **Leads inbox:** payments, invoices and quotes appear on the lead timeline; "Request payment" action on a lead creates a quick one-line invoice.
- **AI Chat (CHAT_BRIEF.md):** the assistant can share an active payment link when a visitor asks how to pay (only links the client marked "shareable in chat").
- **Reviews:** optional setting to send a review request after an invoice is paid.
- **Document signing (SIGNING_BRIEF.md):** quotes can require a signed acceptance before deposit/payment (see Phase D).

## Plans & gating (config, not hard-coded)
- `payments_enabled` (Growth+), `payments_platform_fee_percent` per plan (e.g. 1% on Starter/Growth, 0% on Premium; default 0 until Andrew sets it), `payments_invoices` (Growth+), `payments_links_max`.

## Security & compliance
- Never store or log card data; Payment Element only.
- Verify webhook signatures; idempotent processing; amounts always computed server-side from source records (never trust client-sent amounts).
- Public invoice/link tokens are long random values; rate-limit public pages and payment creation; Turnstile on payment links if abuse appears.
- Show the client's business name, contact info, and refund policy text (setting) on checkout pages.
- Restricted businesses: link to Stripe's restricted businesses list in onboarding copy.

---

## Acceptance criteria
- [ ] `docs/PAYMENTS_STRIPE_NOTES.md` documents the confirmed Connect configuration, onboarding method, fee support, and webhook events.
- [ ] Clients can connect a new or existing Stripe account; status syncs (onboarding, action needed, active, disabled) and requirements show in plain English.
- [ ] All payments are direct charges on the connected account; optional platform fee comes from plan config.
- [ ] Connect webhooks are verified, idempotent, update payments, and trigger feature handlers and notifications.
- [ ] `<SitoMaxCheckout>` is themed per site, supports wallets (Apple Pay/Google Pay where enabled), handles 3DS, and meets the design spec.
- [ ] Payment links, hosted pay pages, Pay section block (3 variants) and Pay button work.
- [ ] Quotes and invoices: create from a lead, send, public page, accept, pay (full/partial), reminders, PDF, statuses from webhooks.
- [ ] Payments dashboard with refunds, filters, export, dispute alerts, and `getPaymentsSummary`.
- [ ] Every Payments screen (home, list, detail drawer, invoices list/editor/detail, public invoice/quote page, payment links, settings) meets the Dashboard design spec, including correct money formatting, status chips, charts, motion, responsive layouts, and accessibility.
- [ ] Quality gate completed with realistic seed data and screenshots of all states.
- [ ] Booking deposits use this module end to end (test mode).
- [ ] Screenshots of onboarding states, checkout (success/failure), invoice page, and dashboard at 375px and 1440px (light + dark) in `docs/screenshots/payments/`.