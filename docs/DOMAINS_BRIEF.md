# DOMAINS_BRIEF.md — Domain Reselling via Vercel Registrar

## Goal
Let SitoMax clients search for, buy, and auto-connect a domain without leaving their dashboard. SitoMax buys the domain through **Vercel's Domains Registrar API** (sold at cost), charges the client a retail price through **Stripe**, and attaches the domain to the client's site automatically. No manual DNS setup.

The existing **guided manual DNS flow stays** for clients who already own a domain elsewhere. This feature is an additional path, not a replacement.

## Non-goals (for this phase)
- Email hosting or email forwarding (later phase; see "Future: email" at the bottom)
- Transferring existing domains in from other registrars
- Premium/aftermarket domains
- White-label agency sub-accounts buying domains (design the schema so it can be added later)

---

## Important constraints — read first
1. **Domain purchases are real money and cannot be undone.** Vercel has no sandbox for registrations. Add an env flag `DOMAINS_DRY_RUN=true` (default `true` everywhere except production) that runs the whole flow but skips the actual `buy` call and fakes a successful order.
2. **We use a single production Supabase database for dev and testing.** All migrations must be additive (new table, new columns). Do not alter or drop existing tables. Seed test rows with a clear `is_test = true` flag.
3. **Never call the buy endpoint before Stripe confirms payment.** The purchase is triggered only from the Stripe webhook, never from the client's browser.
4. **The client is the legal owner.** The registrant contact info must be the client's details, not SitoMax's.
5. **Verify every endpoint path and payload against the current Vercel docs before coding:** https://vercel.com/docs/domains/registrar-api. The paths below are from the docs at the time of writing.

---

## Environment variables
```
VERCEL_API_TOKEN=            # Vercel access token with domain + project scope
VERCEL_TEAM_ID=              # SitoMax team ID
VERCEL_PROJECT_ID=           # The multi-tenant SitoMax project that serves client sites
DOMAINS_DRY_RUN=true         # false only in production
DOMAINS_ALLOWED_TLDS=com,net,org,us,co   # TLDs offered to clients
DOMAINS_MARKUP_MODE=flat     # flat | percent
DOMAINS_FLAT_PRICE_USD=24    # retail price per year when mode=flat (placeholder — Andrew to finalize)
DOMAINS_MARKUP_PERCENT=100   # used when mode=percent
```
Pricing values are placeholders. Keep all pricing logic in one server module (`lib/domains/pricing.ts`) so it can change without touching the flow.

---

## Vercel API endpoints used
All calls are server-side only and pass `?teamId=${VERCEL_TEAM_ID}`.

| Purpose | Method + path |
|---|---|
| Availability (1–200 names) | `POST /v1/registrar/domains/search` or the availability endpoints |
| Price for a domain (purchase + renewal + transfer) | `GET /v1/registrar/domains/{domain}/price?years=1` |
| Contact-info fields required for a TLD | Get contact info schema endpoint |
| Buy a domain | `POST /v1/registrar/domains/{domain}/buy` |
| Order status | Get a domain order (by order ID) |
| Auto-renew on/off | Update auto-renew for a domain |
| Transfer-out auth code | Get the auth code for a domain |
| Attach domain to project | Add a domain to a project (`/projects/{id}/domains`) |

Use the official `@vercel/sdk` package where it covers these, otherwise `fetch` with `Authorization: Bearer ${VERCEL_API_TOKEN}`.

---

## Database (Supabase) — new table `domains`
```sql
create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),   -- adjust to the real client/account table
  site_id uuid references public.sites(id),                 -- adjust to the real sites table
  domain text not null unique,
  tld text not null,
  status text not null default 'pending_payment',
    -- pending_payment | paid | registering | registered | attached | failed | cancelled | transferred_out
  source text not null default 'purchased',                 -- purchased | external (manual DNS flow)
  cost_usd numeric(10,2),                                   -- what Vercel charged
  retail_usd numeric(10,2),                                 -- what the client paid
  renewal_cost_usd numeric(10,2),
  renewal_retail_usd numeric(10,2),
  vercel_order_id text,
  stripe_payment_intent_id text,
  stripe_subscription_item_id text,
  registered_at timestamptz,
  expires_at timestamptz,
  auto_renew boolean not null default true,
  last_error text,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
- RLS: clients can `select` only their own rows. Inserts and updates go through server routes using the service role.
- Check the existing schema first. If the manual custom-domain flow already stores domains somewhere, reuse or link that data instead of duplicating it.

---

## User flow

### 1. Search (client dashboard → "Get a domain")
- Search input with debounce. Server route `POST /api/domains/search` takes a name, returns availability + **retail** price + **retail renewal** price for the allowed TLDs.
- Never send Vercel's cost to the browser.
- Show the renewal price clearly next to the first-year price.
- Suggest alternatives (other allowed TLDs, simple variants) when the exact name is taken.

### 2. Checkout
- The client confirms the domain and fills in registrant contact info. Pre-fill it from their account. Fetch the required fields for the TLD from the contact-info schema endpoint.
- Server route `POST /api/domains/checkout`:
  - Re-check availability and price server-side (never trust the client).
  - Insert a `domains` row with `status = 'pending_payment'`.
  - Create a Stripe Checkout Session (one-time yearly charge) with metadata `{ domain_id, domain }`.

### 3. Stripe webhook → purchase
On `checkout.session.completed` for a domain session:
1. Make the handler idempotent: if the row is already `registering` or later, exit.
2. Set `status = 'paid'`, store the payment intent ID.
3. Call **buy** (skip if `DOMAINS_DRY_RUN`). Set `status = 'registering'` and store `vercel_order_id`.
4. Poll order status (or run a short retry job) until it completes or fails.
5. On success: set `status = 'registered'`, `registered_at`, `expires_at`, `cost_usd`.
6. On failure: set `status = 'failed'` and `last_error`, **refund the Stripe payment automatically**, and notify the client and Andrew (send via Postmark from info@sitomax.com).

### 4. Attach to the site
- Call "add domain to project" on `VERCEL_PROJECT_ID`.
- Link `domains.site_id` to the client's site so the existing hostname middleware resolves it to the right tenant.
- Also add `www.` and redirect it to the apex (or the reverse, matching the current custom-domain convention).
- Set `status = 'attached'`.
- Vercel handles DNS and SSL. Show "Your site is live at …" once a check against the domain succeeds.

### 5. Dashboard: "My domains"
For each domain, show: domain, status, expiry date, auto-renew toggle, renewal price, and a "Transfer out" button.

---

## Renewals and lifecycle
- **Daily scheduled job** (Vercel Cron → `/api/cron/domains`):
  - Domains expiring in 30 days with `auto_renew = true`: charge the client the renewal price via Stripe (saved payment method), 30 days before expiry.
  - Charge fails: email the client, retry on days 3 and 7. If still failing 7 days before expiry, turn **off** auto-renew at Vercel so SitoMax doesn't pay for an unpaid domain. Notify Andrew.
  - Sync `expires_at` from Vercel after each renewal.
- **Client cancels their SitoMax subscription:** keep the domain until expiry, turn off auto-renew, and email the client their transfer options.
- **Transfer out:** the button fetches the auth code from Vercel, shows it to the client (and emails it), and sets `status = 'transferred_out'` once the transfer completes.
- **Auto-renew toggle (client):** updates Vercel via the API and the DB row together.

---

## Admin (super admin view)
- List all domains with filters by status, expiry, and failed renewals.
- Per-domain actions: retry purchase, retry attach, refund, toggle auto-renew, view `last_error`.
- Margin summary: total retail minus total cost.

---

## Error handling and safety
- Every Vercel call is wrapped with retry/backoff for 429/5xx errors, and logs request and response (with secrets redacted).
- The buy call must be guarded by a DB-level check on status so two webhook deliveries can't buy twice.
- Validate domain input against a strict regex. Lowercase and punycode-normalize it.
- Rate-limit the search route per client.

---

## Build order (suggested)
1. Migration + `lib/domains/vercel.ts` (API client) + `lib/domains/pricing.ts`
2. Search route + search UI (no purchase yet)
3. Checkout + Stripe webhook with `DOMAINS_DRY_RUN=true` end to end
4. Attach-to-project + middleware check + "My domains" page
5. Renewal cron, auto-renew toggle, transfer out
6. Admin view
7. Turn off dry run and do one real test purchase on a cheap TLD for SitoMax's own use

## Acceptance checklist
- [ ] A client can search, pay, and see their site live on the new domain with zero DNS steps
- [ ] Vercel cost is never exposed to the browser
- [ ] A failed registration triggers an automatic Stripe refund + notifications
- [ ] Duplicate webhook deliveries never cause a second purchase
- [ ] Renewal charges happen before expiry, and auto-renew turns off on unpaid domains
- [ ] Clients can get their transfer auth code
- [ ] The manual "connect your own domain" flow still works unchanged

---

## Future: email (not in this phase)
Because purchased domains use Vercel DNS, a later "Connect business email" button can add the MX/TXT/SPF/DKIM records for Google Workspace, Microsoft 365, or Zoho through Vercel's DNS records API. Keep the `domains` table and API client structured so DNS-record helpers can be added later.