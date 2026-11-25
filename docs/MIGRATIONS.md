# Production migration record

This file is a manual, reviewed record. It does not create database rows or
automatically enforce migration order. Record a production change only after
the responsible operator verifies it and explicitly approves execution.

## Recorded production state

| Migration | Status | Evidence |
| --- | --- | --- |
| `0052_ai_business_intake.sql` | Applied effects observed | Read-only database inspection on 2026-11-24 |
| `0052_premium_template_catalog.sql` | Applied effects observed, with differences from the branch file | Read-only database inspection on 2026-11-24 |
| `0053_premium_template_repair.sql` | Applied, as reported by the user | User reported successful execution on 2026-11-24; not independently verified |
| `0057_ai_draft_history_header.sql` | Applied, as reported by the user | User reported application on 2026-11-25; not independently verified |

The production database did not expose a
`supabase_migrations.schema_migrations` table, so the historical application
order and the full history through 0051 have not been independently verified.
The premium 0052 SQL in this branch differs from production in its plan-limit
constraint and template-copy function. Do not reapply either 0052 or infer that
the recorded version represents only one of them.

The 0053
`site_creation_settings.marketing_subdomain` starts as `sitomax`; verify it
matches the platform's `MARKETING_SITE_SUBDOMAIN`.
Keep the database setting synchronized with that environment variable when
changing the marketing hostname. Only a super admin may manage the setting.

Future changes use a unique number after all branches' migrations and are
reviewed before production execution. Do not use automated `supabase db push`
against production until the duplicate 0052 versions and all earlier
migration records have been reconciled. A CLI migration-history baseline
would require database writes to create and populate its history table and
cannot represent both different 0052 files as one unique version without a
separately reviewed reconciliation. The manual log requires no database write.

## Phase 2 migration review

The committed SQL is
[`0054_ai_plan_allowances.sql`](../supabase/migrations/0054_ai_plan_allowances.sql),
followed by
[`0055_ai_template_builds.sql`](../supabase/migrations/0055_ai_template_builds.sql),
then [`0056_ai_allowance_template_corrections.sql`](../supabase/migrations/0056_ai_allowance_template_corrections.sql).
The user reported that [`0057_ai_draft_history_header.sql`](../supabase/migrations/0057_ai_draft_history_header.sql)
was applied; do not reapply it. The application status of 0054-0056 has not
been confirmed. Their intended order is 0054, 0055, then 0056. Confirm the
actual production state before applying anything; do not assume any migration
is missing or reapply either 0052 file. These migrations have not been
independently database-validated. Record a migration above only after its
application is confirmed.

0056 is **not strictly additive**: with the user's approval, it replaces the two
0054 legacy-override triggers and two newly introduced functions. Pause legacy
quota changes and do not deploy the feature code until all three migrations
are applied; 0054's original triggers capture unchanged values before 0056.
0056 captures only actual changes and fails explicitly when a client account
has no AI limits. It maps intake actions to CTA labels while retaining the
template CTA text if no action is supplied; it does not change the CTA link.

[`0058_ai_empty_page_history.sql`](../supabase/migrations/0058_ai_empty_page_history.sql)
adds a separate authenticated function for atomic AI empty-page saves and
history snapshots. It does not replace existing functions, triggers or policies,
and deployed main does not call it. Apply only after the history and editor
concurrency migrations are confirmed present, review its SQL, and do not
deploy the feature's empty-page save until it is applied. It has not been
database-tested.
[`phase2_ai_empty_page_history_review.sql`](../supabase/tests/phase2_ai_empty_page_history_review.sql)
is a review-only rollback test for the new function. It requires the TEST
fixtures and separate approval before execution.

[`0059_atomic_ai_template_copy.sql`](../supabase/migrations/0059_atomic_ai_template_copy.sql)
adds a separate authenticated function that calls the existing design-selection,
template-copy and checkpoint functions in one transaction. It checks the
signed-in user and reservation; failed preparation rolls back the selection,
any page surcharge and the copy. Existing
functions, triggers and policies are unchanged, and deployed main does not
call it. It requires the existing 0053 copy function and the 0054-0056
allowance and checkpoint objects; verify their actual production definitions
and apply 0054-0056 in order if missing before considering 0059. It has not
been database-tested or applied. The review-only
[`phase2_atomic_template_copy_review.sql`](../supabase/tests/phase2_atomic_template_copy_review.sql)
requires the TEST fixtures and separate approval before execution.

0054 adds plan allowances and per-account overrides. Its backfill copies
non-default legacy values and does not change existing credit balances. Main
continues calling its legacy reservation and summary functions and showing
legacy limits: the new plan allowances take effect only after the feature code
is deployed. After 0056, its legacy-update triggers capture changed quota values
as overrides, but unchanged values do not create or alter overrides.
The backfill takes a table lock and can wait for active writes. These facts are
based on source review, not a production compatibility or concurrency test.
0054 seeds allowances for the three named plans only. Before deploying the
feature code, verify whether any other plan keys exist or are assigned to
accounts; those plans need explicitly configured allowances or the new
reservation will fail and its usage summary will omit those accounts.

```sql
select p.plan_key, count(a.id) as accounts
from public.site_plans p
left join public.accounts a on a.site_plan_key = p.plan_key
where p.plan_key not in ('starter', 'growth', 'premium')
group by p.plan_key
order by p.plan_key;
```

0055 depends on 0054. It adds template-build reservations, page surcharges,
checkpoint/retry functions and storage for a draft-header snapshot. The
existing site-draft restore function does not restore that header. 0057 adds a
separate restore function for the feature and a backup-insert trigger that
captures the draft header and page pending flags. The old restore function
remains unchanged for main. Historical backups without a captured header
leave the current draft header unchanged; a pre-0057 null header cannot be
distinguished from an uncaptured header. These changes do not publish drafts.
The new trigger affects backup inserts made by deployed main; its production
compatibility has not been independently tested. The
`ai_pending_build` marker is not a database publishing guard. The template
build, its history and its recovery paths remain incomplete and have not been
database-tested; do not treat 0055 or the feature branch as production-ready.
The read-only [`phase2_0055_dependencies.sql`](../supabase/checks/phase2_0055_dependencies.sql)
lists named dependencies and their source migrations. The 0054 function is
expected to be missing before 0054 is applied. The check verifies names only,
not column types, grants, function bodies or indirect dependencies. A missing
object requires investigation; do not blindly reapply an earlier migration.

Check missing AI-limit rows without changing data:

```sql
select a.id, a.name, a.is_internal
from public.accounts a
left join public.ai_limits l on l.account_id = a.id
where l.account_id is null
order by a.name, a.id;
```

Internal accounts intentionally have no limit row. For any client row returned,
investigate before applying changes; 0056 reports an explicit error and does
not insert a row or infer a credit balance.

[`phase2_plan_allowances_review.sql`](../supabase/tests/phase2_plan_allowances_review.sql)
is an unexecuted, rollback-only review test for 0054. It requires the reviewed
Phase 2 fixtures, unused named TEST accounts and separate approval; it does not
test migration backfill, row-level security or concurrent reservations. The
unexecuted [`phase2_template_cta_review.sql`](../supabase/tests/phase2_template_cta_review.sql)
tests header action labels and the absent-action fallback under the same rules.
The unexecuted [`phase2_ai_draft_history_review.sql`](../supabase/tests/phase2_ai_draft_history_review.sql)
checks restoring a header (including null), pending flag and drafts, and undoing
that restore without changing published page data. It requires 0054-0057.

## Phase 2 test fixtures (review only)

`supabase/seeds/phase2_test_fixtures.sql` creates six isolated TEST accounts,
two per master design, with Starter, Growth and Premium represented. It
requires the two existing test users to have matching Auth and profile emails
and exactly one to already be a super admin. It makes the other user the
owner of each fixture account; it never changes either user's privileges.
The script references the existing masters and does not change or copy them.
It refuses to reuse an existing fixture ID or name, requires the approved plan
allowances, and checks that every new account has AI limits and no overrides.

Use only these fixture accounts, `TEST-` site names, `test-` subdomains and
the Showcase, Clarity or Studio masters. Do not connect custom domains.
All test uploads must have filenames beginning `TEST-`; an unmarked stock
image requires manual review rather than automatic deletion. Stop other test
activity before cleanup.
For a selected stock photo, enter `TEST` in the media picker's optional
filename-prefix field before choosing **Use image**. For uploaded files, use a
filename beginning `TEST-`. AI prompt edits stage image suggestions rather than
importing a stock photo. Choose the suggested photo in the editor and use the
same `TEST` filename prefix.

Cleanup needs separate approval. Set `PHASE2_TEST_EXPECTED_PROJECT_URL` to the
intended project URL and configure `NEXT_PUBLIC_SUPABASE_URL` and the
service-role key. `npx tsx scripts/cleanup-phase2-test-uploads.ts` is a
read-only listing of marked uploads. After approval, set
`PHASE2_TEST_CLEANUP_APPROVED=YES` and add `--apply` to remove those objects
using the Storage API. Then review and run
`supabase/seeds/phase2_test_cleanup.sql`. It refuses unexpected members, site
identities, custom domains or remaining uploads. Deleting the accounts also
deletes their test AI usage and cost records. Neither cleanup step alters the
test users or the master templates.

## Premium master comparison

On 2026-11-24, a read-only comparison against main commit
`1e4b7bf324ca420c77847f2b659ec0174d8a19bb` found no differences in the
seeded content fields of the Showcase, Clarity and Studio `site_templates`
rows. The ten referenced `template-assets` objects matched the corresponding
source files by SHA-256, with the expected MIME types and cache settings; no
extra objects were found in that bucket. Database and storage timestamps were
not compared to source files.

The gallery thumbnails in that matching source used generic artwork rather
than home-page screenshots. On 2026-11-24, after user approval,
`scripts/sync-premium-thumbnails.ts` uploaded three new content-addressed PNGs
and updated only `preview_image` and `updated_at` on those master rows. A
subsequent read-only check verified all three rows and assets, including
public PNG responses matching the source bytes. No client sites, pages or
existing assets were changed. Existing site copies may reference older assets,
so those assets must not be overwritten or deleted. The images were captured
from the main-commit home-page source at a 1280 × 800 desktop viewport and
placed in matching 1280 × 800 browser frames.

Review the script and thumbnails before any future production run. It does not load
environment files. Explicitly set `NEXT_PUBLIC_SUPABASE_URL` and
`PREMIUM_THUMBNAIL_EXPECTED_PROJECT_URL` to the intended project's URL, and
set `SUPABASE_SERVICE_ROLE_KEY` for that project. The command
`npm run sync:premium-thumbnails` is a read-only dry run. After separate
approval, set `PREMIUM_THUMBNAIL_SYNC_APPROVED=YES` and run
`npm run sync:premium-thumbnails -- --apply`. The Storage uploads and three
row updates are not one transaction: an error can leave uploaded assets or
earlier row updates in place. Review the error and rerun after resolving it.

## Phase 1 test fixtures

The user reported that the fixture seed and subsequent cleanup both succeeded
on 2026-11-24, and later reported using the TEST accounts for acceptance.
The current fixture state has not been independently verified. Cleanup leaves
the two Auth users in place and demotes the test super admin.

The review-only `supabase/seeds/phase1_test_fixtures.sql` creates six
TEST-prefixed accounts and three TEST-prefixed catalog entries by copying the
currently stored masters. It references their existing protected assets and
does not upload or overwrite them. The copied catalog entries are visible to
authenticated users under the existing catalog RLS policy. They are snapshots
of the **stored** masters, not necessarily the latest TypeScript designs.

Before any approved run, set the dedicated test-user IDs and emails in the
seed and verify they match both Auth and profiles. The seed promotes the
second user to test super admin; the first owns the six fixture accounts.
Use only the six named fixture accounts; use a `TEST-` site name, a `test-`
subdomain and one of the `test-phase1-*` designs. Prefix replacement-image
filenames with `TEST-`. Open the gallery directly at
`/dashboard/sites/new?method=template`; the main creation entry point can
initialize agency membership and is not part of this test.

Cleanup requires separate approval. First review the output of
`npm run cleanup:phase1-test-uploads` (read-only). After approval, set
`PHASE1_TEST_CLEANUP_APPROVED=YES` and run the same command with `-- --apply`
to remove only marked site uploads through the Storage API. Then review and
run `supabase/seeds/phase1_test_cleanup.sql` with the same IDs and emails.
It refuses to remove accounts containing non-test sites or remaining uploads,
removes the fixture accounts and catalog entries, and demotes the test admin.
The two manually created Auth users remain; delete them separately through the
Auth admin interface after checking their IDs. Never delete storage metadata
directly with SQL.
