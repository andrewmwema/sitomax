# SitoMax Leads Inbox + Monthly Results — Build Brief

Build a light lead-management inbox (NOT a full CRM) and a monthly
results email. Work in 3 phases. After EACH phase: build, lint,
typecheck, tests, commit "Leads phase X: …", push, STOP and
summarise. Migrations use the next free number; remind me to run
them in the Supabase SQL Editor.

Reuse what exists: form_submissions, forms page, CSV export,
analytics tables, lib/email (Postmark), sites.business,
sites.timezone, credits/ai_usage, RLS by account membership,
sanitizer. Never fabricate numbers. Client users only ever see their
own sites' leads.

=====================================================================
## PHASE A — Lead inbox core + notifications

A1. Data (migration)
- Treat each form submission as a lead. Add to form_submissions (or
  a linked leads table if cleaner): status (new | contacted | won |
  lost, default new), status_changed_at, assigned_to (nullable
  user), last_activity_at, has_unread_reply (bool), archived (bool).
- lead_notes (lead_id, site_id, author_id, body, created_at).
- lead_events (lead_id, site_id, type: created | status_changed |
  note_added | email_sent | reply_received, data jsonb, actor_id,
  created_at) — powers the timeline and reports.
- RLS: account members of the site only. Super admin all.

A2. Inbox UI (Forms & Submissions page → "Leads")
- List: name, email/phone, source site + page/form, status badge,
  unread-reply dot, received date, last activity. Unread first.
- Filters: status, site, date range, search (name/email/message).
  Saved quick tabs: New · Contacted · Won · Lost · All.
- Bulk: change status, archive, export CSV (keep existing export).
- Lead drawer: contact details (copy buttons, click-to-call,
  mailto), the submitted fields formatted, status dropdown, notes
  (add/edit/delete own), and a timeline from lead_events.
- Small stats strip: New this week, Awaiting reply (new > 24h),
  Won this month, Win rate (won / (won+lost)) — only from real data.

A3. Notifications
- New lead → email to the site's notification recipients (owner by
  default; editable list in site settings) with lead summary and a
  "View lead" button (NEXT_PUBLIC_APP_URL). Use lib/email on the
  default stream.
- In-app: unread badge on the Leads nav item.
- Optional daily digest per user (off by default): "3 new leads,
  2 awaiting reply".
- Notification preferences per user per site (new lead, replies,
  digest).

A4. Integrations (integrate, don't rebuild a CRM)
- Per-site outgoing webhooks: on lead.created, lead.status_changed,
  lead.reply_received → POST JSON to a configured URL, signed with
  HMAC-SHA256 header (X-SitoMax-Signature), retries with backoff,
  delivery log (last 50) with status. Works with Zapier/Make/
  HighLevel/HubSpot via their webhook catchers. Owners only.

=====================================================================
## PHASE B — Reply by email with inbound threading

B1. Data: lead_messages (lead_id, site_id, direction in|out, from,
  to, subject, body_text, body_html (sanitized),
  postmark_message_id, in_reply_to, created_at). The original form
  submission appears as the first message in the thread.

B2. Composer in the lead drawer
- To: the lead's email (fixed — no free-typed recipients).
- Subject default "Re: your inquiry to {Business}".
- Rich text body with Link Picker; signature auto-filled from
  sites.business (name, phone, address, website).
- "✨ Draft reply" (Haiku, 1 small credit): uses the lead's
  message, business info, optional tone (friendly / professional /
  brief). No invented prices, availability or promises — use
  [placeholders] and highlight them before sending.
- Saved reply templates per site (create/edit/use, with
  {first_name}, {business_name} variables).
- Option "Send me a copy" (BCC owner).
- Sending sets status Contacted (if New), logs lead_events, shows
  delivery state.

B3. Sending (lib/email, Postmark)
- Stream: POSTMARK_LEADS_STREAM.
- From: "{Business name} <leads@LEADS_FROM_DOMAIN>".
- Reply-To: reply+{leadId}.{token}@INBOUND_REPLY_DOMAIN where token
  = HMAC(LEAD_REPLY_TOKEN_SECRET, leadId) truncated; unguessable.
- Footer: business name and address; small "Sent via
  {agency name}" line only if the agency setting allows.

B4. Inbound (POST /api/email/inbound, app host only)
- Verify Postmark basic auth (POSTMARK_INBOUND_WEBHOOK_USER/
  PASSWORD). Parse the To/MailboxHash, verify the HMAC token, find
  the lead. Use Postmark's StrippedTextReply when present; otherwise
  strip quoted history. Sanitize, store as inbound lead_message,
  set has_unread_reply, log lead_events, notify recipients by email
  ("{Name} replied") and in-app, fire the webhook.
- Reject invalid tokens (200 OK to Postmark but ignore + log).
  Ignore auto-replies/out-of-office (check headers) except storing
  them collapsed.
- Attachments: not stored for now; note "attachments not shown".

B5. Guardrails
- Replies only to leads from that site's forms. Per-account daily
  send limit (default 50; super admin can change). Log sends; never
  log message bodies in server logs. Handle Postmark errors
  (inactive recipient, bounced) with clear messages; mark lead
  email as bounced.
- Optional Postmark bounce webhook (POST /api/email/events) to mark
  bounced/spam-complaint addresses.
- Leave a TODO + nullable data field for "send from the client's own
  verified domain" (Level 2) — do not build it now.

  B6. Reply delivery to the business owner (explicit requirements)
- Per-site setting "Lead replies" with two modes:
  1) Track in SitoMax + forward to my email (DEFAULT): Reply-To on
     outgoing lead emails is the signed reply+{leadId}.{token}@
     INBOUND_REPLY_DOMAIN address. Every inbound reply is stored on
     the lead AND forwarded in full to the site's notification
     recipients within seconds.
  2) Send replies directly to my email: Reply-To = the owner's
     notification email; nothing is tracked (show this trade-off in
     the setting's help text).
- Forwarded copy format: From "{Lead name} via {Business}
  <leads@LEADS_FROM_DOMAIN>", Reply-To = the lead's real email (so
  replying from Gmail/Outlook reaches the lead directly), subject
  "Re: …" preserved, full reply text, the original message quoted
  below, and buttons "View conversation" / "Reply in SitoMax"
  (NEXT_PUBLIC_APP_URL). Footer note: "Replies sent from your email
  won't appear in SitoMax history — reply in SitoMax to keep it."
- Recipients: site notification recipients (default: account
  owner's email); editable in site settings with email validation.
- If forwarding fails, keep the stored reply, show an in-app
  warning, and retry up to 3 times.
- Tests: inbound webhook → message stored → forward email sent to
  the correct owner only (never another account's owner) with the
  right Reply-To; mode 2 sets Reply-To to the owner; invalid token
  → nothing forwarded.

=====================================================================
## PHASE C — Monthly results email

C1. Content per site (previous calendar month, in sites.timezone):
  "{Business}, your website in {Month}:
   {visits} visits · {leads} leads · {won} marked as won"
  plus: change vs the previous month (only if that month has data),
  top 3 pages, top lead sources (page/form), leads awaiting reply,
  and one helpful tip (e.g. "Reply within an hour to win more
  jobs"). Clear CTA: "Open your dashboard".
- Use real data only. Visits = page views/visits as currently
  tracked; do NOT call daily visitor IDs "unique people". If
  tracking had no data, say so plainly.
- Agencies/super admin get an "All clients" summary email listing
  each site's numbers.

C2. Sending
- Cron route /api/cron/monthly-reports (protected by CRON_SECRET),
  scheduled hourly; sends each site's report on the 1st of the
  month at ~9:00 in the site's timezone. Idempotent: table
  report_sends (site_id, period, sent_at) so nothing sends twice.
- Stream: POSTMARK_REPORTS_STREAM. Branded with agency name/logo.
- Recipients: site owners (opt-out per user). Every email includes
  a one-click unsubscribe link (signed with EMAIL_LINK_SECRET) and
  a "Manage email preferences" link.
- Dashboard: "Preview report" for any month and "Send test to me".

=====================================================================
## General
- Polished UI matching the current design system; works on tablet.
- Tests: RLS isolation, token signing/verification, inbound parsing,
  webhook signing, report numbers (fixtures), idempotent cron.
- Update .env.example, README and copilot-instructions.md with new
  env vars and the Postmark setup.