# Production incidents

## 2026-11-27: editor saves exhausted database capacity

Supabase reported high CPU, PGRST002 (schema cache unavailable) and PGRST003
(pool timeout). Approximately 29 `save_page_with_header` calls were waiting on
the same site's row, alongside an idle, aborted transaction.

The editor retried dirty drafts every 10 seconds indefinitely, without backoff
or a failure ceiling. Every header-backed save locked and updated `sites`, even
when only page content changed. The shared lock turned repeated failed requests
into database contention. Inspection found one persistence hook, stable initial
Puck data/overrides, and no Puck `onChange` save handler; an every-render effect or
multiple autosaving components was not demonstrated. Raw JSON dirty comparisons
were also sensitive to object key order. The old hook already guarded its
in-flight promise; this code inspection alone does not explain all 29 concurrent
database sessions from one tab. A client request finishing/failing does not prove
its server-side database work has ended, so bounded database waits are essential.

### Fix

- Canonical, collision-free page/header/theme fingerprints ignore request-only
  tokens. Initial and unchanged drafts do not save.
- Autosave waits 1.8 seconds after the last content change. One save may run and
  at most one latest-state save may wait. Saved callbacks do not restart saves.
- Transient errors back off 2/4/8/16 seconds, with a 60-second ceiling, and stop
  after five failed attempts. Validation/permission errors and conflicts stop
  immediately. The editor exposes Saved, Saving, and Couldn't save — Retry;
  conflicts still require reload.
- Tabs hidden for five minutes pause autosave. Visibility/unload events attempt
  one dirty flush, respecting the in-flight request, backoff and failure ceiling.
  Flushes use an authenticated, same-origin keepalive endpoint with the same
  guarded save actions. Browser keepalive limits (typically 64 KiB across pending
  requests) and abrupt process termination mean unload saving is best-effort;
  the unsaved-navigation warning remains. Save large drafts before closing.
- [Migration 0063](../supabase/migrations/0063_editor_save_contention.sql) removes
  the site lock from body-only saves, guards actual header/theme/page updates,
  preserves compare-and-swap checks even on no-ops, and returns the stored page
  version from both editor save RPCs.

### Other database writes reviewed

No-op guards were added to header extraction/promotion, draft-theme saving,
legacy timezone updates, selective publishing (header/timezone), AI draft
checkpoint business updates, AI template checkpoint business/header updates,
selected AI page themes, and AI draft restoration themes/headers.

The migration applies 3-second lock and 10-second statement timeout settings to
these RPCs and the reviewed generation, template, restoration and AI apply/undo
entry points. AI apply/undo and multi-page operations retain their transaction
locks for compare-and-swap, history and accounting; publishing still clears a
pending theme and records explicitly requested page publications/snapshots.

The editor save RPCs contain no transaction-control statements and propagate errors, so
PostgREST rolls back a failed request, including earlier header/theme writes.
A function cannot close a transaction opened by an external SQL client:
idle/aborted sessions require that client's rollback or a separately configured
`idle_in_transaction_session_timeout`. Function-local `statement_timeout` alone
does not start a new timer for an already-running outer statement. Configure an
appropriate outer request/role timeout separately; the function's `lock_timeout`
does directly bound each lock wait.

### Rollout and verification

Follow-up [migration 0064](../supabase/migrations/0064_editor_null_header.sql)
makes SQL NULL mean "no header change", including theme/snapshot saves.
Non-null changed headers still require the correct expected baseline.
The existing migration 0045 trigger strips both page version tokens and assigns
the replacement token to `draft_version` on updates; no trigger change is needed.

Review both 0063 and 0064 and apply them in order manually in the Supabase SQL Editor
before deploying the matching client/server code. Reload open editor tabs after
deployment. No production migration was applied by the assistant.

Tests cover rapid edits, one in-flight/latest queued save, unchanged drafts,
five-attempt backoff, hidden tabs, endpoint authorization, no-op page versions,
CAS rollback and a body-only save succeeding while another connection holds the
site lock (a genuine header edit fails with lock timeout).
