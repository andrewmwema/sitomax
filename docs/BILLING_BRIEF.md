# SitoMax Billing (Stripe) — Build Brief

Bill client accounts for SitoMax plans with Stripe Billing. Work in
3 phases; after EACH: build (or rely on Vercel preview if local
build runs out of memory), lint, typecheck, tests, commit "Billing
phase X: …", push, STOP and summarise. Migrations use the next free
number; remind me to run them in Supabase.

Principles: Stripe is the source of truth for payments; our DB
mirrors subscription state via webhooks. Never trust the client for
plan/price. Secret keys server-only. Prices are found by Stripe
lookup keys (starter_monthly, starter_yearly, growth_monthly,
growth_yearly, premium_monthly, premium_yearly, setup_fee).
No Stripe Connect yet (agency plan later).

=====================================================================
## PHASE A — Subscriptions, checkout, portal, webhooks

A1. Data (migration)
- billing_customers (account_id unique, stripe_customer_id).
- subscriptions (account_id, stripe_subscription_id, status
  [trialing|active|past_due|unpaid|canceled|incomplete|
  incomplete_expired|paused], plan [starter|growth|premium],
  interval [month|year], current_period_end, cancel_at_period_end,
  canceled_at, updated_at).
- accounts.billing_mode: 'stripe' (default) | 'comped' (free/manual,
  e.g. internal SitoMax account, friends, pilots) with optional
  comp_plan and comp_reason. Internal account is always comped.
- stripe_events (event_id unique, type, processed_at) for
  idempotency.
- RLS: account members can READ their own billing rows; only the
  server (admin client) writes.

A2. Plans config (lib/billing/plans.ts — single source of truth)
- For each plan: name, lookup keys, marketing bullets, and limits
  used later (sites, pages per site, monthly AI credits, custom
  domain, lead replies/day, blog, monthly report, team members).
  Starter $59, Growth $149, Premium $299 (annual = 10× monthly).

A3. Billing page (client: Settings → Billing; owners only)
- Current plan, status badge, renewal/cancel date, payment method
  summary (from Stripe), "Manage billing" → Stripe Customer Portal.
- No plan yet → plan picker (monthly/annual toggle, 3 cards, current
  plan highlighted) → Stripe Checkout (mode=subscription), with
  optional setup_fee line item when the agency has enabled it for
  that account. Allow promotion codes. success_url/cancel_url on
  NEXT_PUBLIC_APP_URL.
- Create the Stripe customer on first checkout (email = account
  owner, metadata account_id). One customer per account.

A4. Webhook: POST /api/stripe/webhook (app host only; raw body;
  verify STRIPE_WEBHOOK_SECRET; idempotent via stripe_events).
  Handle: checkout.session.completed, customer.subscription.created
  /updated/deleted, invoice.paid, invoice.payment_failed,
  customer.subscription.trial_will_end. Map Stripe price lookup_key
  → plan/interval. Return 200 quickly; log errors without secrets.

A5. Super admin (agency) view
- Clients list shows plan + billing status + MRR per client.
- Client detail: plan, status, next renewal, "Open in Stripe" link,
  "Send checkout link" (creates a Checkout Session and emails the
  owner via Postmark), enable/disable setup fee for this client,
  set billing_mode comped (with reason) or back to stripe.

=====================================================================
## PHASE B — Entitlements and enforcement

B1. lib/billing/entitlements.ts: getEntitlements(accountId) from
  subscription/comped plan. Used server-side everywhere.
B2. Enforce limits with clear upgrade prompts (never silently fail):
  number of sites, pages per site, monthly AI credits (integrate with
  existing ai_limits), custom domains, lead replies/day, blog,
  monthly report, team members. Super admin unlimited.
B3. Status handling:
  - active/trialing: full access.
  - past_due: full access + banner "Payment failed — update card"
    (link to portal); email owner (Stripe also emails).
  - canceled at period end: access until current_period_end, banner
    with date + "Resume subscription".
  - after cancellation/unpaid + 14-day grace: editor read-only,
    published site stays up during grace, then shows a neutral
    "This site is temporarily unavailable" page (no agency upsell
    text). Data kept 90 days; reactivating restores everything.
  - comped: full access per comp_plan.
B4. Downgrades: if over a new plan's limits, keep existing content
  but block creating more until within limits; explain clearly.

=====================================================================
## PHASE C — Polish and reporting

C1. Annual/monthly switching and plan changes via the Customer
  Portal (prorations on). Coupons/promotion codes supported
  (e.g. NONPROFIT).
C2. Agency revenue dashboard (super admin): MRR, active
  subscriptions by plan, past_due list, cancellations this month,
  upcoming renewals — from our mirrored data (not fabricated).
C3. Client invoices list (links to Stripe-hosted invoices/PDFs).
C4. Optional Stripe Tax support behind a setting (automatic_tax on
  Checkout) — off by default.
C5. Docs: README section for Stripe setup, test cards, and webhook
  testing with the Stripe CLI.

Tests: webhook signature + idempotency, lookup_key → plan mapping,
entitlement checks, status transitions, RLS on billing tables.