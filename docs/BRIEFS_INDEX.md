# SitoMax Feature Briefs — Index

All briefs live in `docs/`. Give the Codespaces agent ONE brief at a time:
> "Read docs/<BRIEF>.md fully, give me a short plan, then do Phase A only."

After each phase the agent builds, lints, typechecks, runs tests, commits, pushes, and stops with a summary. Run any new migrations in the Supabase SQL Editor before the next phase.

---

## The briefs

| # | File | What it adds | Main provider | Depends on |
|---|---|---|---|---|
| 1 | `GRADER_BRIEF.md` | Free website grader on sitomax.com: AI audit, email gate, leads into SitoMax's own inbox, PDF report, follow-ups | Google PageSpeed (free key), Claude, Postmark, Turnstile | Leads inbox |
| 2 | `SOCIAL_BRIEF.md` | Social posting: connect accounts, composer, AI posts, calendar, scheduling, approvals; Google review functions in the same provider module | Upload-Post (Zernio = future fallback) | Leads inbox |
| 3 | `REVIEWS_BRIEF.md` | Review requests, review landing page, QR code, Google review sync + AI replies, website Reviews block, share to social, dashboard | Upload-Post (Google reviews), Postmark | Social (provider module), Leads inbox |
| 4 | `CHAT_BRIEF.md` | AI chat assistant on client sites: knows the business, answers questions, captures leads into the inbox | Claude Haiku, Supabase (pgvector for big sites) | Leads inbox, Turnstile (from Grader) |
| 5 | `BOOKING_BRIEF.md` | Online booking: services, availability, booking page/section, emails, reminders, calendar feed, owner calendar, deposits (Phase E), waivers | Supabase, Postmark, Vercel Cron | Leads inbox; Payments (Phase E); Signing (waivers) |
| 6 | `PAYMENTS_BRIEF.md` | Stripe Connect for clients: onboarding, themed checkout, payment links + Pay buttons, quotes & invoices, payments dashboard | Stripe Connect ("Stripe handles pricing", direct charges) | Leads inbox |
| 7 | `SIGNING_BRIEF.md` | E-signatures: templates, send for signature, branded signing page, signed PDFs on leads, quote acceptance, booking waivers | DocuSeal (API + embedding) | Leads inbox; Payments (quotes); Booking (waivers) |
| 8 | `LISTINGS_BRIEF.md` | Local listings add-on: BrightLocal report upload, listings dashboard, link checker, business-info changes, profile access onboarding | BrightLocal (manual ordering; API later) | Leads inbox, Postmark |
| 9 | `SEO_BRIEF.md` | Sitemaps with accurate lastmod, robots.txt, IndexNow, automated Google Search Console (verify, submit sitemap, search data, index status), unified Analytics tabs (Overview · Website traffic · Google Search · SEO health) | Google Search Console + Site Verification APIs (free), IndexNow | Existing analytics (Phase 7), SEO toolkit (7b), sitemap (9) |
| 10 | `BRAND_KIT_BRIEF.md` | Brand kit & logo designer: Claude art direction + Recraft vector symbols + exact wordmarks, free monograms, logo upload, full deliverables (logos, palette, fonts, brand guide, icons, social kit, business card, email signature, ZIP), applied across SitoMax; 20-generation cap; included in subscription + one-time offers (extra designs, rebrand, Pro logo designer refinement) and a standalone paid kit on sitomax.com | Claude Sonnet, Recraft API, SitoMax's own Stripe (one-time Checkout) | AI site generator, theme system |

---

## Build order (this is the order to follow; the # in the table above is just a label)
1. **SEO Phases A–B** — sitemap/robots upgrades + IndexNow. Small, helps every site.
2. **Grader** — standalone; brings in SitoMax leads; sets up the Google Cloud project (PageSpeed key) and Turnstile.
3. **SEO Phases C–E** — Google Search Console + unified Analytics tabs (uses the same Google Cloud project).
4. **Social** — creates the Upload-Post provider module.
5. **Reviews** — needs the Upload-Post module from Social.
6. **AI Chat** — reuses Turnstile from the Grader.
7. **Booking Phases A–D** — booking without deposits.
8. **Payments** — shared Stripe Connect module.
9. **Booking Phase E** — deposits; needs Payments.
10. **Signing** — quote acceptance and booking waivers; needs Payments and Booking.
11. **Listings** — anytime you're ready to sell it (manual ordering, few dependencies).
12. **Brand Kit** — flexible; build early if many clients lack logos (it feeds the AI site generator and every branded page). Best after Social if you want branded post templates on day one.

**Hard dependencies (must follow):** Social → Reviews · Payments → Booking Phase E · Payments + Booking → Signing · Grader → SEO Phases C–E (shared Google project).
**Flexible:** SEO A–B, AI Chat, Booking A–D, Listings, and Brand Kit can move earlier or later.

(10 brief files; SEO and Booking each appear twice because part of each waits on another brief.)

---

## Shared rules across all briefs
- Each third-party service sits behind ONE module/interface (`SocialProvider`, `lib/payments`, `SigningProvider`, …) so providers can be swapped later.
- Every feature writes to the **Leads inbox** timeline (`lead_events`) and exposes a `get…Summary()` helper for the **monthly results email**.
- Plan gating and limits live in config, not hard-coded.
- Premium design bar on every screen (see SOCIAL_BRIEF.md §13 and each brief's design spec); screenshots at 375px and 1440px (light + dark) saved under `docs/screenshots/<feature>/`.
- Never fabricate numbers; show "Couldn't check" / empty states honestly.

### Cross-feature triggers
- Lead marked **Won**, booking **Completed**, or invoice **Paid** → `scheduleReviewRequest()` (each trigger is a setting; max one request per customer per 90 days).
- Quote **"Require signature to accept"** → signing completes → quote accepted → optional deposit.
- Booking service **requires waiver** → signing completes → booking confirmed (or waiver satisfied before the appointment).
- Chat **"Book a call"** → booking flow (or lead form if booking is off); chat can share **payment links** marked shareable.
- 4–5★ review → **Share to social**.

---

## Accounts & keys to set up (when you reach each brief)
| Brief | What you need |
|---|---|
| Grader | Free Google PageSpeed Insights API key (no billing); Cloudflare Turnstile keys; optional `GOOGLE_PLACES_API_KEY` later |
| Social / Reviews | Upload-Post account (Professional plan for white-label) + API key |
| Chat | Existing Anthropic key; Turnstile (from Grader) |
| Booking | Nothing new (Supabase, Postmark, Vercel Cron) |
| Payments | Stripe Connect enabled, platform profile/branding, Connect webhook + `STRIPE_CONNECT_WEBHOOK_SECRET` |
| Signing | DocuSeal account (sandbox first; Pro seat $20/mo + $0.20/signed doc in production), API key, webhook |
| SEO | Same Google Cloud project: enable Search Console API + Site Verification API (no billing); service account or SitoMax Google account |
| Brand Kit | Recraft API account + key (`RECRAFT_API_KEY`); existing Anthropic key; one-time Stripe Prices in SitoMax's own Stripe account (extra designs, rebrand, Pro logo, standalone kits) |
| Listings | BrightLocal account (Citation Builder credits); Google/Facebook manager access from clients |

Add every new env var to `.env.example` and to Vercel (Production + Preview).