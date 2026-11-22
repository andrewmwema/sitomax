# Leads Inbox Redesign — Build Brief

Redesign Leads as an email-style team inbox. Work in 3 phases; after
EACH: `npx tsc --noEmit`, `npm run lint`, tests, commit "Leads inbox
phase X: …", push, STOP and summarise. Reuse/finish the uncommitted
draft migration (review it first); next free migration number;
remind me to run it in Supabase.

Decisions (final):
- Read state, stars, reminders and snooze are SHARED across everyone
  with access to the account (team inbox).
- Delete = move lead + messages + notes to Trash, restorable 30 days,
  then auto-purged. Only owners/super admins can delete or empty
  Trash. Archive is the main action; Delete in ⋯ with confirm.
- Follow-up reminder: 1/3/7 days counted from when it's set;
  cancelled automatically if the customer replies.
- Snoozed leads: hidden from Needs reply and Waiting on customer
  until due; still visible in All open and other views.

## PHASE A — Data and view logic (no big UI yet)
- Columns/tables: starred, archived_at, deleted_at (trash),
  snoozed_until, remind_at, last_message_direction, last_message_at,
  last_message_preview, unread (shared). Indexes for list queries.
  RLS by account membership; trash actions owners-only.
- Server functions for views with counts: Needs reply (new with no
  reply, or last message inbound; excludes snoozed/archived/trash),
  Waiting on customer (last message outbound; excludes snoozed),
  All open, Starred, Won, Lost, Archived, Trash. Search (name,
  email, message text), site filter, cursor pagination.
- Actions: star/unstar, mark read/unread, archive/unarchive,
  snooze/unsnooze, set/clear reminder, move to trash/restore,
  bulk versions. Inbound reply clears reminder and marks unread.
- Daily cron (existing CRON_SECRET pattern) to purge trash > 30 days
  and surface due reminders/snoozes.
- Tests for view rules and RLS.

## PHASE B — Three-pane inbox UI
- Desktop: Views sidebar | conversation list | open conversation.
  Tablet: list + conversation. Mobile: list → full-screen
  conversation with back button. URL /dashboard/leads/[leadId].
- List rows: name/email, site (agency view), one-line preview,
  relative time, status chip, unread bold + dot, star. Virtualized
  list, bulk select toolbar.
- Conversation: sticky header (name, contact, site, status dropdown,
  star, archive, ⋯); thread with lead left / ours right, sender
  shown as team member NAME + "via SitoMax", newest at bottom,
  older messages collapsed, quoted text collapsed; reply box pinned
  at bottom (templates, ✨ Draft reply, "Send & mark Won/Lost");
  technical From/Reply-to hidden behind "Email details" (shown by
  default for super admin). Right panel tabs: Details, Notes,
  Timeline. Times in the viewer's local timezone.

## PHASE C — Follow-ups, shortcuts, polish
- Reminder and snooze controls in the header (1/3/7 days, custom
  date) with clear chips on the lead.
- Keyboard shortcuts: j/k, r reply, e archive, s star, u unread,
  / search, ? shortcuts sheet.
- Trash view with Restore / Delete forever (owners).
- Empty states per view ("You're all caught up ✓").