# SitoMax Leads Inbox — Premium Redesign Brief
(desktop, tablet and mobile)

## Goal
Redesign the Leads UI into a polished, modern, premium email-style
inbox (quality comparable to Linear, Front, Superhuman, Gmail),
fully optimized for desktop, tablet and mobile. Conversation
history (form submission + every email) must remain visible and
easy to read. Data model, APIs, actions and RLS stay the same unless
a phase says otherwise.

## How to work
- 3 phases. After EACH phase: run `npx tsc --noEmit`, `npm run lint`
  and tests; fix all errors; commit "Leads redesign phase X: …";
  push; STOP and summarise what changed and how to test it.
- Never push if tsc or lint report errors.
- No fabricated data. Keep all existing features working: views,
  search, star, archive, snooze, reminders, mark unread, trash,
  status, notes, timeline, replies, AI draft, templates, BCC copy,
  delivery status.

## Design system
- Use SitoMax tokens: brand blue #1E51F7 (primary actions, links,
  focus), navy #151829 (headings), body #3A3F55, muted #6B7085,
  borders #E6E8EF, app background #F5F6FA, surfaces #FFFFFF.
- 14px base UI text (15px in the email body/editor), clear type
  hierarchy, rounded-xl cards, subtle borders, soft shadows only on
  floating elements (menus, composer, drawers).
- Icon buttons with tooltips instead of large text buttons.
- Status pills: New (blue), Contacted (slate), Won (green),
  Lost (gray/red) — restrained colors, WCAG AA contrast.
- Smooth but subtle transitions; skeleton loading states; friendly
  empty states.
- Keyboard accessible, visible focus rings, proper ARIA for menus,
  tabs, dialogs and drawers.
- One scroll region per pane: the inbox fills the viewport height
  below the app header; no nested page + pane scrolling.

=====================================================================
## PHASE A — Desktop layout (≥ 1200px) + Gmail-style composer

### A1. Layout
- Remove the separate "Inbox views" column.
- Two panes:
  1. List pane (default 360px, resizable 320–440px, width
     remembered per user).
  2. Conversation pane (fills the rest).
- Optional Details drawer on the right (340px), toggled with an ⓘ
  button, open/closed state remembered per user.

### A2. List pane
- Top: search input ("Search leads…").
- View tabs under search: "Needs reply (n) · Waiting (n) · All (n)
  · More ▾". More menu: Starred, Won, Lost, Archived, Trash — each
  with a count.
- Agency users: compact site filter (All sites ▾).
- Lead rows:
  • Colored initials avatar.
  • Lead NAME from the form's name field (fallback: email). Never
    show "Form submission" as the title.
  • Site name (agency view only), small and muted.
  • One-line preview of the latest message ("You: …" if ours).
  • Relative time (e.g. "2h", "Nov 21").
  • Unread: bold name + blue dot.
  • Status pill; small icons when snoozed / reminder set.
  • Star appears on hover (always visible when starred).
  • Selected row clearly highlighted.
- Bulk mode: checkbox on hover → toolbar (Mark read/unread, Change
  status, Archive, Star, Move to trash).
- Infinite scroll / virtualized list for large inboxes.
- Empty states: Needs reply → "You're all caught up ✓" with a link
  to All; other views → short helpful message.

### A3. Conversation header (sticky)
- Avatar, lead name, then "email · phone · site" (email/phone click
  to copy; phone is a tel: link).
- Status pill as a dropdown that saves immediately (remove the
  "Save status" button); shows a small "Saved" confirmation.
- Icon buttons with tooltips: Star, Archive, Snooze, Reminder, Mark
  unread, ⋯ (Move to trash, Export), ⓘ Details.
- Active snooze/reminder shown as a small chip ("Reminder in 3
  days · Clear").

### A4. Thread
- Centered reading column (max ~760px) inside the conversation pane.
- First card: "Form submission" — submitted fields as a clean
  label/value list, source page, received time.
- Each email as a card:
  • Sender: team member NAME + "via SitoMax" for ours; lead name for
    theirs. Small avatar.
  • Time in the viewer's local timezone (full date/time on hover).
  • Subject only when it differs from the previous message.
  • Body with formatting preserved; quoted history collapsed behind
    a "•••" toggle.
  • For our emails: delivery status (Sent / Delivered / Bounced).
- Date separators ("Today", "Yesterday", "Nov 21").
- More than 5 messages → older ones collapsed ("Show 4 earlier
  messages").
- Internal notes optionally shown inline as subtle yellow cards
  (toggle "Show notes in thread").
- Auto-scroll to the newest message when opening a lead.

### A5. Composer — Gmail/Outlook style
- Docked at the bottom of the conversation pane as a card.
- Collapsed state: one line "Reply to {first name}…" — click to
  expand. "↗" pop-out opens it as a larger centered modal.
- Header rows (borderless fields separated by thin dividers):
  • To: recipient chip "Name <email>" (fixed, not editable).
  • "Bcc me" toggle on the right (replaces "Send me a copy").
  • Subject: inline borderless field, prefilled "Re: …".
  • Never show the reply+ tracking address. From/Reply-to appear
    only inside ⋯ → "Email details" (shown by default for super
    admins).
- Body: borderless rich-text area, 15px, line-height 1.6,
  placeholder "Write your reply…", auto-grows up to ~50% of the
  viewport, then scrolls. Pasting from Word/Google Docs is
  sanitized.
- Signature inside the body as a muted, editable block under "--":
  sender name, business name, phone, website. Per-user signature
  editable in Settings → Email signature (defaults from
  sites.business).
- Previous message appended as a collapsed "•••" quote and included
  in the sent email as a quoted block.
- Bottom toolbar (one row of icon buttons with tooltips):
  • Primary blue "Send" split button: Send · Send & mark Won ·
    Send & archive. Ctrl/Cmd+Enter sends.
  • "A" toggles a formatting bar above the toolbar: Bold, Italic,
    Underline, text color (theme palette), bulleted list, numbered
    list, quote, link (Link Picker), clear formatting. Shortcuts
    Ctrl+B / I / U / K.
  • ✨ Draft with AI (menu: Friendly, Professional, Brief, Improve
    my draft) — uses existing credits and rules (no invented
    prices/availability; [placeholders] highlighted before send).
  • 📄 Templates (insert, or save current reply as a template).
  • ⋯ (Email details).
  • 🗑 Discard draft (with confirm) on the right.
- Drafts autosave per lead ("Draft saved" near Send) and restore
  when the lead is reopened.
- Sending: button shows progress; success → toast "Reply sent" and
  the message appears in the thread; error → inline message with
  the reason (super admins see the technical detail) and Retry.
- The sent email uses the same clean, personal formatting, with the
  signature and quoted history.

### A6. Details drawer (desktop: right panel)
- Tabs: Contact · Notes · Timeline.
- Contact: all submitted fields, source site/page, received time,
  copy buttons, tel/mailto links.
- Notes: add, edit, delete own notes; newest first.
- Timeline: status changes, emails sent/received, notes,
  reminders — each clickable to scroll to the message.

=====================================================================
## PHASE B — Tablet (768–1199px) and mobile (< 768px)

### B1. Tablet
- Two panes: list (300–340px) + conversation. No separate details
  pane — ⓘ opens Details as an overlay drawer from the right.
- View tabs collapse to "Needs reply · Waiting · All · More ▾".
- Composer docked at the bottom; pop-out opens a near-full-screen
  modal.
- Touch targets at least 44px; hover-only actions (star, bulk
  checkbox) get visible alternatives (long-press or a select mode
  button).
- Works in both portrait and landscape.

### B2. Mobile — list screen
- Header: "Leads" title + search icon (expands to a full-width
  search field) + filter icon (site filter for agency users).
- View chips in a horizontally scrollable row with counts:
  Needs reply · Waiting · All · Starred · Won · Lost · Archived ·
  Trash.
- Full-width lead rows (avatar, name, preview, time, unread dot,
  status pill). Swipe left → Archive; swipe right → Mark
  read/unread (with undo toast).
- Pull to refresh. Infinite scroll.
- App sidebar becomes a hamburger drawer; Leads shows its unread
  badge there and on the hamburger icon.

### B3. Mobile — conversation screen
- Full screen, opened from the list with a slide transition.
- Sticky header: back arrow, avatar, name, status pill (tap to
  change, saves immediately), ⋯ menu with all actions (Star,
  Archive, Snooze, Reminder, Mark unread, Move to trash, Details).
- Segmented tabs under the header: Conversation · Details · Notes.
- Thread uses the full width with comfortable padding; cards as on
  desktop; tap a phone number to call, email to copy.
- Sticky bottom bar: "Reply…" field.

### B4. Mobile — composer
- Tapping "Reply…" opens a full-height bottom sheet: To chip,
  Subject, body, signature, collapsed quote.
- Formatting bar sits directly above the keyboard (Bold, Italic,
  list, link, ✨, 📄); "Send" in the sheet header (top right) and
  "Cancel/Discard" top left.
- Keyboard-safe: the active field is never hidden behind the
  keyboard (use visualViewport / safe-area insets).
- Draft autosaves; closing the sheet keeps the draft.
- Success → toast + sheet closes; error → stays open with message.

### B5. Responsive quality checks
- Verify at 375×812 (iPhone), 390×844, 430×932, 768×1024 (iPad
  portrait), 1024×768 (iPad landscape), 1280×800 and 1440×900.
- No horizontal scrolling at any width; text never clipped; safe
  areas respected on iOS; dark-mode-safe colors in emails.

=====================================================================
## PHASE C — Deep links, performance, polish

### C1. Deep links from emails
- "Reply now" / "View conversation" links in notification emails
  open /dashboard/leads/[leadId] with no view filter.
- The opened lead is always shown even if it isn't in the current
  view; on mobile it opens directly in the conversation screen.
- If logged out, login preserves the link and lands on the lead.

### C2. Performance
- Lists load the first page quickly (skeletons), paginate on
  scroll; opening a lead loads its thread on demand.
- Optimistic UI for star, archive, status, read/unread with
  rollback on error.
- Real-time-ish updates: refresh the list and open thread when a
  new reply arrives (polling every 30–60s or Supabase realtime if
  already used).

### C3. Keyboard shortcuts (desktop)
- j / k next / previous lead, Enter open, r reply, e archive,
  s star, u mark unread, # move to trash, / search,
  Ctrl/Cmd+Enter send, Esc close composer/drawer, ? shortcuts
  sheet.

### C4. Final polish
- Consistent spacing, alignment and typography across all three
  breakpoints.
- Accessibility pass (labels, focus order, contrast, screen-reader
  names for icon buttons).
- Tests: list view rules, deep-link behavior, composer draft
  autosave, send success/failure states, responsive rendering at
  375 / 768 / 1440 widths.