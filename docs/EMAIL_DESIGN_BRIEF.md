# SitoMax Email Design System — Build Brief

Make every email the app sends polished, consistent, upscale and
reliable across Gmail, Outlook (desktop + web), Apple Mail and
mobile. Work in 2 phases; after EACH: `npx tsc --noEmit`, lint,
tests, commit, push, STOP and summarise.

## PHASE A — Foundation + inventory
1. Inventory: list every email currently sent (auth emails via the
   Supabase Send Email Hook or SMTP, client invites, new-lead
   notifications, lead reply forwarded copies, outgoing lead
   replies, test notification, domain wizard emails, checkout/
   billing links, digests, monthly reports if present). Show the
   list with file paths before changing anything.
2. Use React Email (@react-email/components + render) server-side.
   Every email returns { subject, html, text, preheader }.
3. Shared components in emails/components/: EmailLayout (header with
   logo, content card, footer), Heading, Text, Button (bulletproof,
   Outlook-safe), InfoCard (key-value details), Divider, Badge,
   StatRow (for reports), MessageQuote (for forwarded replies),
   Footer (company name, address line, support email, links,
   unsubscribe link when applicable).
4. Design tokens (from lib/brand.ts; agency branding can override):
   - Brand blue #1E51F7 (buttons/links), navy #151829 (headings),
     body text #3A3F55, muted #6B7085, border #E6E8EF, page
     background #F5F6FA, card #FFFFFF.
   - Font stack: -apple-system, "Segoe UI", Inter, Roboto, Helvetica,
     Arial, sans-serif (no reliance on web fonts).
   - 600px max width, 32px card padding (20px on mobile), 8–12px
     radius, generous line height (1.6), 16px body text.
   - Logo as hosted PNG (2× resolution, explicit width/height, alt
     text) — never SVG in emails.
   - Dark mode: test and add color-scheme meta + safe colors so the
     logo and buttons stay legible.
   - Every email has a preheader (preview text), a single clear
     primary action, accessible contrast (WCAG AA), and a plain-text
     version.
5. Dev preview: super-admin page /dashboard/settings/emails listing
   every template with sample data, rendered preview (desktop/
   mobile toggle), and "Send test to me" (via Postmark, correct
   stream).

## PHASE B — Rebuild every email with the system
- Auth: invite to SitoMax, set/reset password, email change — warm,
  short, branded, clear button + fallback link, expiry note,
  "didn't request this?" line.
- Client invite: who invited them, what SitoMax is, "Accept invite".
- New lead notification: "New lead from {site}" — InfoCard with the
  submitted fields, "Reply now" button (deep link to the lead),
  "Needs reply" hint.
- Reply received (forwarded copy): "{Lead} replied" — MessageQuote
  of the reply, earlier message collapsed below, buttons "Reply in
  SitoMax" / "View conversation"; Reply-To = the lead's email.
- Outgoing lead replies (business → customer): clean, personal
  style — no big header or banner; the business's message, then a
  tasteful signature block (business name, optional logo small,
  phone, website). Minimal HTML for deliverability.
- Domain emails: instructions (DNS records in a clear table with
  copy-friendly monospace values), "Domain connected 🎉", "We
  couldn't verify yet — here's what to check".
- Digest + monthly report: StatRow with real numbers only, short
  insights, CTA to the dashboard, unsubscribe + preferences links.
- Billing/checkout link emails: plan summary card, "Complete
  checkout" button.
- Consistent subject lines (clear, no ALL CAPS, no spammy words) and
  sender names ("SitoMax" for platform; "{Business}" for lead
  replies).
- Snapshot tests for each template (renders, has text version,
  no broken links/placeholders).