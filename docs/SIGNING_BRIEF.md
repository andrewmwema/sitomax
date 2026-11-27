# SIGNING_BRIEF.md — Document Signing (DocuSeal, embedded)

## Goal
Let SitoMax clients send documents for e-signature (service agreements, quote acceptance, waivers, consent and onboarding forms) and have their customers sign on beautiful, branded SitoMax pages. Signed PDFs and their audit trails are stored on the lead, and signing can automatically trigger the next step (accept quote → request deposit, sign waiver → confirm booking).

**Provider:** DocuSeal (API + embedded signing). Pricing at time of writing: free unlimited sandbox for testing; production requires at least one Pro seat ($20/month) plus $0.20 per completed document (multiple files/signers in one submission count as one). Confirm in DocuSeal's docs.

Builds on what already exists:
- **Leads inbox / light CRM** (leads, `lead_events`, `lead_messages`, notifications), `lib/email` (Postmark), `sites.business`, section library theming, credits/usage tracking, RLS by account membership, sanitizer.
- **PAYMENTS_BRIEF.md** (quotes/invoices, `<SitoMaxCheckout>`), **BOOKING_BRIEF.md** (services, bookings), **CHAT_BRIEF.md**.

Work in phases. After EACH phase: build, lint, typecheck, tests, commit "Signing phase X: …", push, STOP and summarise. Migrations use the next free number; remind Andrew to run them in the Supabase SQL Editor. **Build and test entirely in the DocuSeal sandbox first.**

**Before coding:** read DocuSeal's current API, embedding (React components / web components), template, and webhook docs. Record confirmed endpoints, auth, webhook events and signature verification, embedding options (signing form and template builder), branding/white-label options, PDF/audit-trail download, and pricing rules in `docs/SIGNING_PROVIDER_NOTES.md`.

---

## Key design rules
1. **Provider-agnostic module.** All DocuSeal calls live in `lib/signing/` behind a `SigningProvider` interface (`DocuSealProvider` implementation). No other code calls DocuSeal directly, so the provider can be swapped (e.g. BoldSign or Documenso) without UI changes.
2. **SitoMax is the source of truth** for documents, statuses, and links to leads/quotes/bookings. The provider stores the signing session and produces the signed PDF + audit trail; SitoMax copies the final signed PDF and audit trail into Supabase Storage.
3. **Customers sign on SitoMax pages** (client's site domain or app host) using DocuSeal's embedded signing form, themed to the client's brand. Customers should never feel they left the business's site.
4. **Legal notice:** settings and the template library show a short note: "E-signatures are generally valid in the US for most business documents, but some documents (e.g. wills, certain court and real-estate filings) are excluded. Check with your attorney for regulated documents." Not legal advice.

---

## Environment
| var | notes |
|---|---|
| `DOCUSEAL_API_KEY` | server-side only (sandbox key first, then production) |
| `DOCUSEAL_API_URL` | sandbox vs production base URL |
| `DOCUSEAL_WEBHOOK_SECRET` | verify webhook requests (per DocuSeal docs) |
| `SIGNING_ENABLED` | global kill switch |

Remind Andrew to create the DocuSeal account, get sandbox keys, configure the webhook URL, and add env vars in Vercel.

---

## PHASE A — Core module, data, templates

### A1. `SigningProvider` interface
```ts
interface SigningProvider {
  createTemplateFromFile(input: { siteId, name, file: Buffer, fileType: 'pdf' | 'docx' }): Promise<{ providerTemplateId }>
  createTemplateFromHtml(input: { siteId, name, html, fields }): Promise<{ providerTemplateId }>
  getTemplateBuilderSession(providerTemplateId): Promise<{ token/url for embedded builder }>
  createSubmission(input: {
    providerTemplateId, signers: Signer[], prefill?: Record<string, string>,
    order?: 'preserved' | 'random', expiresAt?, sendEmail: false, metadata
  }): Promise<{ providerSubmissionId, signerSessions: { signerId, embedSrc/slug }[] }>
  getSubmission(providerSubmissionId): Promise<ProviderSubmission>
  getSignedDocuments(providerSubmissionId): Promise<{ signedPdfUrl, auditTrailUrl }>
  archiveSubmission(providerSubmissionId): Promise<void>
  verifyWebhook(req): boolean
}
```
- SitoMax sends its own branded emails (Postmark) with links to SitoMax signing pages; disable provider emails (`sendEmail: false` or equivalent) unless DocuSeal requires otherwise.
- Map DocuSeal webhook events to SitoMax statuses; idempotent processing by event id.

### A2. Data (migration)
**`signing_templates`**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| site_id | uuid fk | |
| name, description | text | |
| category | text | `agreement` \| `waiver` \| `quote_acceptance` \| `consent` \| `onboarding` \| `other` |
| source | text | `upload` \| `starter` \| `generated` |
| provider_template_id | text | |
| signer_roles | jsonb | e.g. [{ role: "Customer" }, { role: "Business", auto_sign?: false }] |
| prefill_map | jsonb | SitoMax field → template field (e.g. customer.name → "Full Name", quote.total → "Total") |
| preview_image_url | text null | first page thumbnail |
| active | bool | |
| created_at, updated_at | timestamptz | |

**`signing_documents`** (one per send / submission)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| site_id | uuid fk | |
| template_id | uuid fk | |
| title | text | e.g. "Service Agreement — Sam Lee" |
| lead_id | uuid null | |
| related_type | text null | `quote` \| `invoice` \| `booking` \| `service` |
| related_id | uuid null | |
| provider_submission_id | text | |
| status | text | `draft` \| `sent` \| `viewed` \| `partially_signed` \| `completed` \| `declined` \| `expired` \| `voided` |
| expires_at | timestamptz null | |
| signed_pdf_path, audit_trail_path | text null | Supabase Storage (private bucket `signed-documents`) |
| completed_at | timestamptz null | |
| created_by | uuid | |
| created_at, updated_at | timestamptz | |

**`signing_signers`**: `id, document_id, role, name, email, phone null, order_index, status ('pending' | 'sent' | 'viewed' | 'signed' | 'declined'), access_token (≥128-bit, for the SitoMax signing URL), provider_signer_id, embed_ref, viewed_at, signed_at, ip, user_agent, decline_reason`.

**`signing_events`**: `id, document_id, signer_id null, type, data jsonb, provider_event_id unique null, created_at` (powers the timeline; idempotency).

RLS: account members manage their site's templates/documents; signers only via token-scoped server routes; super admin all. Signed PDFs served via short-lived signed URLs only.

### A3. Templates
- **Upload** a PDF or Word file → create provider template → open the **embedded template builder** (DocuSeal's builder, themed) to place fields: signature, initials, date (auto), name, email, text, checkbox, radio, dropdown, phone, image/file upload.
- **Starter templates** (client edits before use, clearly marked "Starter — review before using"): Service Agreement, Estimate/Quote Acceptance, Liability Waiver, Photo/Media Consent, New Client Intake, Cancellation Policy Acknowledgment. Built as HTML templates with the business name/address auto-filled from `sites.business`.
- **Generated documents:** for quotes, generate the document from the quote's data (line items, totals, terms) at send time so the signed PDF contains exactly what was accepted.
- Prefill mapping UI: map SitoMax data (customer name/email/phone/address, business info, quote number/total/date, booking date/service) to template fields.

### A4. Usage & limits
- Track completed documents per site per month (`signing_usage` or reuse credits/usage tables).
- Plan config: `signing_docs_per_month_included`, `signing_overage_price_cents`, `signing_enabled`. When the included amount is used: allow overage (billed) or block with an upgrade prompt, per plan config.
- Super admin alert when platform-wide monthly completions approach a configurable budget.

---

## PHASE B — Sending & signing experience

### B1. Send flow (dashboard)
- Entry points: Documents → **New document**; lead drawer → **Send for signature**; quote editor → **Require signature to accept**; booking service settings → **Require waiver**.
- Steps (in a polished full-screen sheet): 1) choose template (visual gallery), 2) add signers (prefilled from the lead; roles; signing order; optional "Business countersigns" step), 3) review prefilled fields with a live document preview, 4) message + expiry (default 14 days) + reminders (default 3 and 7 days), 5) **Send**.
- Options: send by email (Postmark, branded), copy signing link, or "Sign now in person" (opens the signing page on this device for in-office/tablet use).

### B2. Customer signing page (`/sign/{access_token}`)
- Hosted on the client's site domain (or app host) with the site's branding; embeds DocuSeal's signing form via their embedding component, themed to match.
- Before signing: short consent line "By continuing, you agree to sign electronically" with a link to the business's terms/privacy (ESIGN-style consent; confirm DocuSeal's built-in consent handling and don't duplicate awkwardly).
- After completion: branded success screen with animated check, "Signed! A copy has been emailed to you," **Download signed PDF**, and the next-step button provided by the related feature (e.g. "Pay deposit" for quotes, "View your appointment" for bookings).
- Decline flow: optional "Decline to sign" with reason → owner notified.
- Expired/voided/already-signed states with clear messaging and business contact info.

### B3. Webhooks & automation
- `POST /api/signing/webhook`: verify, dedupe, update `signing_signers`/`signing_documents`, write `signing_events` and `lead_events` (`document_sent`, `document_viewed`, `document_signed`, `document_completed`, `document_declined`).
- On **completed**: download the signed PDF + audit trail to Storage, email the PDF to all parties (Postmark), notify the owner, and call the related feature's handler:
  - **Quote:** mark accepted (store signer name/time), then optionally create the deposit request / show "Pay deposit" (PAYMENTS_BRIEF.md).
  - **Booking waiver:** mark the waiver satisfied; if the booking required it before confirmation, confirm the booking (BOOKING_BRIEF.md).
- Reminders via Vercel Cron (respect expiry; stop on completion/decline/void).

---

## PHASE C — Dashboards (premium)

### C1. Documents home
- Stat tiles: Awaiting signature · Completed this month · Average time to sign · Completion rate.
- **Needs attention:** documents expiring in 48h, declined documents, documents viewed but not signed for 3+ days — each with an action (Remind, Resend, Void).
- Recent activity feed (signed, viewed, sent) with avatars and relative times.

### C2. Documents list
- Tabs with counts: All · Awaiting · Completed · Declined · Expired · Drafts.
- Columns: Document (title + template name muted) · Signers (avatar stack with per-signer status dots) · Status chip · Related (Quote #, Booking date) · Sent · Last activity · ⋯ menu.
- Search, filters (template, status, date), CSV export. Mobile: cards.

### C3. Document detail
- Left: **document preview** (signed PDF once complete; otherwise the prepared document) with page thumbnails and zoom.
- Right panel: status, signers list (name, email, role, status, viewed/signed times), **timeline** (Created → Sent → Viewed → Signed → Completed, with IP/time from the audit trail), related item link, and actions: Remind, Copy link, Download signed PDF, Download audit trail, Void, Duplicate.

### C4. Templates gallery
- Card grid with page thumbnail, name, category chip, field count, last used, usage count; "Starter" badge for starters; actions: Use, Edit fields (opens embedded builder in a full-screen themed shell), Duplicate, Archive.
- "New template" → upload (drag-and-drop zone) or choose a starter.

### C5. Integration surfaces
- Lead drawer: "Documents" section listing that contact's documents with status chips.
- Quote/invoice detail: signature status and signed PDF link.
- Booking drawer: waiver status ("Waiver signed ✓" / "Waiver pending").
- Monthly results email hook: `getSigningSummary(siteId, start, end)` → sent, completed, average time to sign.

---

## Design spec — upscale, modern, polished (this is a selling feature)
Quality bar: **DocuSign's newer UI, PandaDoc, Linear, Stripe Dashboard.** Documents and signatures should feel official, calm, and trustworthy. Reuse SitoMax dashboard tokens (same system as SOCIAL_BRIEF.md §13 and PAYMENTS_BRIEF.md design spec).

### Visual system
- Cards 12–16px radius, hairline borders, soft shadows, generous whitespace (20–24px padding, 24–32px section gaps).
- **Document previews** render on a subtle gray canvas with realistic page shadows (like paper), crisp at any zoom; thumbnails have rounded corners and a light border.
- **Status chips (icon + text, soft tint):** Draft (gray, pencil) · Sent (blue, paper-plane) · Viewed (violet, eye) · Partially signed (amber, half-circle) · Completed (green, check-seal) · Declined (red, x) · Expired (gray, clock) · Voided (gray, slash).
- **Signer avatars:** initials in soft colors with a status ring (gray pending, violet viewed, green signed, red declined); stacked with overlap; tooltip shows name and status.
- Typography: titles 28–32px, section heads 18–20px, body 14–16px, meta 12–13px muted; tabular numbers for stats.
- Dark mode supported; check document canvas contrast in both modes.

### Send flow polish
- Full-screen sheet with a left step rail (Template · Signers · Fields · Message · Review) and a large live preview on the right.
- Template picker: visual gallery with thumbnails and category filters.
- Signers step: add from lead with autocomplete, drag to reorder signing order, role chips, color-coded per signer (the same color highlights that signer's fields in the preview).
- Review step: summary card (who signs, in what order, expiry, reminders) and the email preview; big primary **Send** button with a satisfying sent animation (paper-plane, 400ms).

### Signing page polish (customer-facing)
- Branded header (logo, business name), document title, and a progress indicator ("2 of 5 fields complete") with a **Next field** guide button that scrolls to the next required field (highlight pulse).
- Signature capture: tabs Draw / Type / Upload; drawing pad with smooth strokes, clear/undo; typed signatures in 3 tasteful script fonts.
- Mobile-first: full-width pages, pinch-zoom, sticky bottom bar with "Next" / "Finish", 44px targets.
- Completion: animated check, confetti-free elegant success card, download and next-step buttons.
- Trust cues: lock icon, "Secure e-signature", business contact link, audit-trail note ("A record of this signing is stored with the document").

### Embedded builder & signing form theming
- Wrap DocuSeal's embedded components in a SitoMax shell (header, step rail, actions) and apply theming options DocuSeal supports (colors, fonts, logo, CSS overrides) so they match the SitoMax dashboard (builder) and the client's site (signing). Document what's customizable in `docs/SIGNING_PROVIDER_NOTES.md`.

### Motion, responsiveness, accessibility
- 150–250ms transitions; drawer slide 220ms; count-up stats; respects `prefers-reduced-motion`.
- Breakpoints tested at 375px, 768px, 1280px, 1440px; tables → cards on mobile; drawers → full-screen sheets.
- Keyboard navigation, focus traps in sheets/drawers, ARIA labels, live region announcements for status changes; WCAG AA contrast in light and dark modes. Note any accessibility limits of the embedded signing form in the provider notes.

### Empty, loading, error states
- Skeletons for lists, previews, and stats.
- Empty states: "No documents yet — send your first agreement" with Starter template cards; "No templates yet — upload a PDF or start from a template".
- Plain-English errors with next steps ("This document expired on Mar 4. Send a new copy?").

### Quality gate (before marking done)
- Seed realistic data (a contractor and a salon: 6 templates, 30 documents across all statuses, quotes with signatures, bookings with waivers).
- Screenshots of every screen and state (home, list, detail, templates gallery, builder shell, send flow steps, customer signing page on mobile/desktop, success, expired, declined) at 375px and 1440px in light and dark mode, saved to `docs/screenshots/signing/`.
- Self-review against this spec and fix gaps before handing off.

---

## Security & compliance
- API key server-side only; webhook verification; idempotent processing.
- Signer access tokens are long random values, single-document scoped; rate-limit signing pages.
- Signed PDFs and audit trails in a private Storage bucket; access via short-lived signed URLs; never public.
- Sanitize all user-entered text displayed in dashboards and emails.
- Retention: keep signed documents for the life of the account (configurable); deleting a site requires exporting/deleting documents per policy.
- Never log document contents or signer personal data in server logs.

---

## Acceptance criteria
- [ ] `docs/SIGNING_PROVIDER_NOTES.md` documents confirmed DocuSeal endpoints, embedding, theming options, webhooks, and pricing rules.
- [ ] All provider calls go through `SigningProvider` / `DocuSealProvider`.
- [ ] Templates: upload (PDF/Word) with embedded builder, starter templates with business info prefilled, generated quote documents, prefill mapping.
- [ ] Send flow from Documents, lead, quote, and booking service; email (Postmark), copy link, and sign-in-person options; signing order, expiry, reminders.
- [ ] Customer signing page on the client's domain, themed, mobile-first, with consent, guided fields, decline, and success/expired/voided states.
- [ ] Webhooks update statuses, store signed PDF + audit trail, email copies, notify owner, write lead events, and trigger quote acceptance/deposit and booking waiver confirmation.
- [ ] Usage tracking and plan limits/overage work; admin budget alert works.
- [ ] Dashboards (home, list, detail, templates gallery, lead/quote/booking surfaces) meet the design spec; `getSigningSummary` is correct.
- [ ] Quality gate completed with seed data and screenshots of all states.