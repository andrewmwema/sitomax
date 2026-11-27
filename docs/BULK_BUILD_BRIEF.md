# SitoMax Bulk Build, Trade Packs & Site Audit — Build Brief

Admin-only (super admin) features to turn a list of leads into polished,
distinct preview websites, ready for outreach. Work in 4 phases. After EACH:
`npx tsc --noEmit`, `npm run lint`, tests, commit "Bulk build phase X: …",
push to the `bulk-build` branch, STOP and summarise. Migrations use the next
free number; never edit committed migrations.

## Principles
- Everything built here is a private DRAFT preview: noindex, "Preview" badge,
  excluded from sitemaps, never published, never on a custom domain.
- No invented facts: years in business, licenses, reviews, awards, prices and
  guarantees come only from the spreadsheet; otherwise the copy writes around
  them or uses a [placeholder].
- No third-party logos/photos unless a URL is provided in the sheet (the admin
  confirms permission); default to stock photos from the trade pack.
- Never send outreach emails from the platform (Postmark is transactional only).
  The platform exports data for an external outreach tool.
- Reuse the existing AI site generator (two-stage plan/fill, curated designs,
  zod validation, Pixabay photos, credits/ai_usage logging as agency usage).

=====================================================================
## PHASE A — Trade packs
1. lib/trades/ with one pack per trade, typed and validated:
   - id, label, schema.org type (e.g. RoofingContractor, Plumber,
     HVACBusiness, Electrician, GeneralContractor, HomeAndConstructionBusiness)
   - default pages + section plan per page (curated designIds)
   - default services, common specialties, FAQ topics (questions only — answers
     written from business data, generic and factual)
   - trust elements to include when data exists (licensed/insured, emergency
     service, service area, financing) — only shown if the sheet says so
   - CTA presets ("Call now", "Free estimate", "Free roof inspection"…)
   - 3–4 color palettes, 2–3 font pairings, hero layout options
   - stock photo search queries per section
   - tone guidance and words to avoid
2. First packs: Roofing, Plumbing, HVAC, Electrical. Then a general
   "Home services" pack used for any other trade until its pack exists.
   Trade list must match the template's Trades tab.
3. AI site builder: add a "Trade / industry" dropdown; the selected pack shapes
   the plan, pages, sections, copy, photos and JSON-LD.

## PHASE B — Bulk import & build queue (super admin only)
1. Dashboard → "Bulk build" page.
2. Upload .xlsx or .csv using the SitoMax_Bulk_Build_Template.xlsx format:
   sheet "Leads", group headers in row 1, column names in row 2, data from
   row 3. Match columns by NAME (ignore order/unknown columns). Skip rows whose
   business_name contains "(EXAMPLE)". Max 200 rows per upload.
3. Validation preview table: row status (ok / warning / error), with clear
   messages (missing business_name or trade, invalid email, duplicate
   subdomain, reserved subdomain, invalid hex color, unknown trade). Allow
   inline fixes or excluding rows. Show estimated AI cost and time.
4. Build: a durable job queue (database table bulk_jobs + bulk_job_items),
   processed by a background worker/cron with concurrency 2–3, retries (1
   automatic retry per item), resumable after deploys, cancellable. Each item:
   create the site under an internal "Prospects" account (super admin owned,
   excluded from client counts/billing), apply the trade pack + row data,
   generate pages, run the site quality check, take a thumbnail.
5. Distinctness: each site gets a different combination of palette, font
   pairing, hero layout and section designs from its trade pack (seeded by
   lead_id, avoiding repeats within the same batch and trade). Copy is
   generated from the row's real details. Add a similarity check between
   sites in the same batch; regenerate copy if too similar.
6. Results dashboard: per row — thumbnail, business, trade, status (queued /
   building / ready / failed), QA warnings, cost, preview link. Bulk actions:
   open, regenerate, delete, assign to a client account (moves the site out of
   Prospects; used when a lead becomes a client), export.
7. Preview expiry: previews auto-delete after 60 days unless claimed or
   extended (warning shown 7 days before).

## PHASE C — Existing website audit
1. For rows with existing_website, an "Audit websites" action (also runs
   before building, optional) checks, server-side with timeouts:
   - reachable? (status code, redirects, broken/parked/"under construction")
   - https / valid SSL
   - mobile viewport meta tag
   - title + meta description present
   - copyright year in the footer
   - contact form / tel: links present
   - Google PageSpeed Insights API (mobile): performance, accessibility, SEO
     scores (env PAGESPEED_API_KEY; skip gracefully if not set)
2. Store results per row and write plain-English, factual issues to
   website_issues (only what was actually detected — no guesses), plus
   website_status (none / outdated / poor / ok / unverified).
3. Respect robots.txt and rate-limit requests; never crawl beyond the homepage
   and contact page.

## PHASE D — Outreach export & claim flow
1. Preview page for each prospect site has a small, tasteful bar:
   "This free preview was built for {Business} by SitoMax — Claim this website"
   → a short form (name, email, phone, message) that creates a lead in the
   agency inbox and notifies the super admin. No payment on this page.
2. Export (CSV/XLSX) of the batch with all original columns plus preview_url,
   status, and outreach_subject / outreach_email / followup_email with
   {preview_url}, {first_name} and {business_name} replaced — ready to import
   into an external cold-email tool.
3. Track per prospect: preview views (count, first/last viewed) and claim
   clicks, shown in the results dashboard. No tracking pixels in emails.

## Tests
Spreadsheet parsing (header row 2, extra/missing columns, example-row skip),
validation rules, queue retry/resume/cancel, trade pack application,
distinctness seeding, audit parsing (with mocked HTTP), export placeholder
replacement, preview noindex + expiry, RLS (super admin only).