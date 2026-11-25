# Phase 2 review package

**Review only.** No production SQL, uploads, database tests or live AI calls are
authorized by this package. The SQL files linked below contain the exact
statements; do not run them automatically or infer migration history from file
numbers. The branch is not production-ready until database and acceptance
checks pass. Confirm each operation separately before performing it.

## Production state and preflight

The user reported 0053-0057 applied. Both 0052 files have observed effects,
but the production premium-catalog definition differs from the branch file.
Do not reapply 0052-0057. The user reports that the key 0058-0061 functions
are absent; their complete production state has not been independently
verified. See the
[manual migration record](./MIGRATIONS.md).

Before deciding what to apply, review the exact read-only queries in
[`phase2_0055_dependencies.sql`](../supabase/checks/phase2_0055_dependencies.sql)
and [`phase2_final_dependencies.sql`](../supabase/checks/phase2_final_dependencies.sql),
plus [`phase2_0054_0057_dependencies.sql`](../supabase/checks/phase2_0054_0057_dependencies.sql)
for direct references in those functions,
the other-plan and missing-limit queries in the migration record, and actual
function and trigger definitions. These queries are not a migration history
and cannot prove compatibility. In particular, the user reports that 0055's
`site_draft_versions.header`, which 0057 references, is present. If other
required objects are missing, existing backup writes may fail: stop and
investigate rather than rerunning a reported migration.

Do not use `supabase db push` against production: the duplicate 0052 numbers
and historical state need separate reconciliation. Record migrations in the
manual log only after the operator confirms their application.

## Local verification

The full local suite passed **1,046 tests**, with the one database-backed test
skipped; `npx tsc --noEmit` and `npm run lint` passed. Database and AI-provider
credentials were blank for the unit suite. No live AI call, database test,
fixture, upload or migration was performed.

## Exact migration SQL, conditional order

The following links are the full committed SQL. Do not reapply 0054-0057,
which the user reports applied. Consider later migrations only after reviewing
their prerequisites and existing definitions:

1. [`0054_ai_plan_allowances.sql`](../supabase/migrations/0054_ai_plan_allowances.sql)
2. [`0055_ai_template_builds.sql`](../supabase/migrations/0055_ai_template_builds.sql)
3. [`0056_ai_allowance_template_corrections.sql`](../supabase/migrations/0056_ai_allowance_template_corrections.sql)
4. 0057 was reported applied; **do not reapply**.
5. [`0058_ai_empty_page_history.sql`](../supabase/migrations/0058_ai_empty_page_history.sql)
6. [`0059_atomic_ai_template_copy.sql`](../supabase/migrations/0059_atomic_ai_template_copy.sql)
7. [`0060_ai_template_brand_colors.sql`](../supabase/migrations/0060_ai_template_brand_colors.sql)
8. [`0061_ai_template_logo.sql`](../supabase/migrations/0061_ai_template_logo.sql)

0054 backfills non-default legacy limits as account overrides and preserves
existing extra credits. 0055 adds template reservations, page surcharges and
checkpoints. **0056 is not strictly additive:** the user previously approved
its replacement of two 0054 triggers and two new functions. Pause legacy quota
changes if 0054 is present without 0056, and do not deploy the branch until
the prerequisites and corrections are confirmed. 0058-0061 add separate
functions without replacing existing functions, triggers or policies; 0060
depends on 0059, and 0061 depends on 0054-0057 and 0059. Source review is not
a database compatibility, rollback, authorization or concurrency test. The
0057 backup trigger affects deployed main and has not been independently
database-tested.

## TEST fixtures and cleanup

- Exact setup: [`phase2_test_fixtures.sql`](../supabase/seeds/phase2_test_fixtures.sql).
  It creates eight `TEST-PHASE2-` accounts, uses the existing
  `support@sitomax.com` and `hello@sitomax.com` users, and gives each new
  fixture 12 TEST credits for page surcharges. It changes no user privileges.
  It refuses pre-existing fixture IDs or names and requires the approved plan
  allowances. Review and approve it separately before execution.
- Optional limit UI setup after the Mode 2 client build:
  [`phase2_test_exhaust_edits.sql`](../supabase/seeds/phase2_test_exhaust_edits.sql).
  It sets that TEST account's remaining TEST credits to zero and inserts
  simulated completed requests to exhaust its actual Starter allowance. It
  makes no AI calls. These fake requests affect that fixture's usage until
  cleanup. Review and approve this separate write first.
- Exact upload cleanup:
  [`cleanup-phase2-test-uploads.ts`](../scripts/cleanup-phase2-test-uploads.ts).
  With the intended project URL in `PHASE2_TEST_EXPECTED_PROJECT_URL`, and
  the matching `NEXT_PUBLIC_SUPABASE_URL` and service-role key configured,
  `npx tsx scripts/cleanup-phase2-test-uploads.ts` lists marked uploads without
  deleting them. After **separate cleanup approval**, setting
  `PHASE2_TEST_CLEANUP_APPROVED=YES` and adding `--apply` deletes the listed
  objects through the Storage API. The script refuses unmarked uploads or
  nested folders.
- After upload cleanup, separately review and run
  [`phase2_test_cleanup.sql`](../supabase/seeds/phase2_test_cleanup.sql).
  It refuses unexpected fixture identities, members, site markers, domains or
  remaining uploads. It deletes fixture accounts and their test sites,
  requests, usage and cost records, not the existing users or master designs.

Use only `TEST-` site names, `test-` subdomains and fixture accounts; do not
connect custom domains. Name every uploaded file `TEST-...`. For a Pixabay
selection, enter `TEST` in the picker filename-prefix field before **Use
image**. Stop other TEST activity before cleanup; review unmarked objects
manually, never broaden the script's deletion scope.

## Proposed database checks

After separate approval and confirmed prerequisites, create the TEST fixtures
and run these rollback-only SQL tests **before** creating acceptance sites:

1. [`phase2_plan_allowances_review.sql`](../supabase/tests/phase2_plan_allowances_review.sql)
2. [`phase2_template_cta_review.sql`](../supabase/tests/phase2_template_cta_review.sql)
3. [`phase2_ai_draft_history_review.sql`](../supabase/tests/phase2_ai_draft_history_review.sql)
4. [`phase2_ai_empty_page_history_review.sql`](../supabase/tests/phase2_ai_empty_page_history_review.sql)
5. [`phase2_atomic_template_copy_review.sql`](../supabase/tests/phase2_atomic_template_copy_review.sql)
6. [`phase2_template_brand_colors_review.sql`](../supabase/tests/phase2_template_brand_colors_review.sql)
7. [`phase2_template_logo_review.sql`](../supabase/tests/phase2_template_logo_review.sql)

Each rolls back its TEST writes. The logo test temporarily inserts TEST Storage
metadata but uploads no object. They do not prove all migration backfills,
production compatibility, actual object storage, concurrent execution or
end-to-end behavior; a failure blocks the live acceptance test. Do not run
other database-backed tests against production.

## Proposed live acceptance and cost

This is a new estimate, not approval to call AI. The previous $1.86 estimate
was for fewer calls. For eight template builds, six recommendations, ten
prompt-edit runs and two business extractions, a conservative illustrative
budget is **about $6.33**, with a suggested **$15 stop-and-review threshold**:

| Assumption | Estimated cost |
| --- | ---: |
| Up to 60 page fills: 44 across the three designs for both roles, plus up to 16 for two recommendation builds; 12k input and 5k output tokens each on Sonnet 5.5 | $4.44 |
| 14 moderation calls at 1k input/100 output and six recommendations at 2k input/300 output, Sonnet 5.5 | $0.084 |
| Ten editor-agent runs, assuming three calls each and conservatively pricing all 30 as Sonnet 5.5 at 20k input/2k output | $1.80 |
| Two extractions at 4k input/1k output on Haiku 5.5 | $0.0018 |
| **Illustrative total** | **$6.3258** |

This assumes no cache discount, validation retries, timeout charges, extra
agent turns, taxes or infrastructure charges. It is not a hard maximum: actual
prompts, outputs, retries, model selection and pricing can differ. A single
validation repair is possible per structured call; more agent turns or an
uncertain provider outcome can also increase cost. Check recorded usage after
each site/run, stop rather than retry on errors or uncertain outcomes, and
request further approval before exceeding the proposed threshold. The threshold
is a manual stop rule, not an enforced spending cap.

On 2026-11-25, [Anthropic's published API pricing](https://platform.claude.com/docs/en/about-claude/pricing)
listed Sonnet 5.5 at $2/input and $10/output per million tokens, and Haiku 5.5
at $0.10/input and $0.50/output for prompts up to 100k tokens. Longer Haiku
prompts and cache writes cost more. Confirm the actual configured model and
pricing before any calls; `ANTHROPIC_MODEL` changes the generation model.

## Configuration for acceptance and later deployment

Use the existing project credentials in Codespaces' local environment; after
approval and successful checks, configure the same variables in Vercel's
appropriate environment before deploying. Do not copy secret values into the
repository or the review conversation. The full baseline is
[`.env.example`](../.env.example).

| Variables | Source and purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing Supabase project API settings; browser-safe project URL and anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing Supabase project API settings; server only. |
| `ANTHROPIC_API_KEY` | Anthropic Console API key; server only. |
| `ANTHROPIC_MODEL` | Optional server-only priced model; default `claude-sonnet-5-5`. |
| `PIXABAY_API_KEY` | Pixabay API account key; server only, required to test stock selection. |
| `ROOT_DOMAIN`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `MARKETING_SITE_SUBDOMAIN`, `NEXT_PUBLIC_AGENCY_NAME` | Existing deployment's routing and branding configuration; local app URL should match the forwarded origin. |

Keep all unrelated existing Vercel settings unchanged. These instructions do
not approve changing Vercel, Auth redirects, or any production environment.

After migration, fixture and live-test approvals:

1. In Codespaces, run `npm run dev`, open its forwarded port 3000 URL, and
   sign in with the existing test users; identify the client and agency from
   their existing roles, without changing permissions. Configure the local
   server's Supabase URL/anon key, server-only service-role key,
   `ANTHROPIC_API_KEY`, and `PIXABAY_API_KEY`; configure `ROOT_DOMAIN`,
   `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, and the marketing
   subdomain for the intended host. Do not paste secrets into chat or git.
   Verify the forwarded app host and existing Auth redirect configuration
   before starting; do not change production configuration without approval.
2. As each role, use the three corresponding fixture accounts to build one
   unpublished Showcase, Clarity and Studio site for fictional TEST
   businesses. Exercise intake colors and a `TEST-` logo. Review all pages,
   mobile/desktop preview, text, legal placeholders, highlighted missing facts,
   image suggestions, and editable sections. Save, reload and reopen.
3. As each role, try three different business descriptions for recommendations;
   cancel unused recommendations. Use the corresponding Mode 2 fixture to
   build one recommendation and verify switching designs works.
4. As each role, perform five scoped editor prompt edits; discard one, apply
   the others, then test history and Undo. Check usage and stop for unexpected
   errors or costs. Use the separately approved limit fixture and wait at least
   a minute after other AI activity to verify the client limit message without
   a provider call.
5. Choose a suggested Pixabay image with prefix `TEST`, then replace it with a
   `TEST-` upload. Verify source metadata and persistence. Check two sites from
   one master are independent and the masters unchanged. Simulate invalid
   output and timeouts with existing mocked tests, not live provider failures.
   Do not publish TEST pages or change non-TEST sites.
6. After separate cleanup approval, list and remove marked uploads, run the
   guarded cleanup SQL, and verify fixture removal.

## Known limitations

- AI may repurpose interior draft copy and draft titles, but copied page URLs
  and menu labels are not automatically renamed.
- Logo selection is held in the browser until the build stops. Closing it
  early loses the selection; a failed/uncertain upload or concurrent logo
  change requires reviewing the site's media library and choosing the logo
  in the editor. It never silently overwrites a newer logo.
- Pixabay returns up to five results; fewer than three may be available.
  The original image remains until the user chooses a replacement.
- An interrupted checkpointed build may require waiting for a lease to expire
  or agency reconciliation. `ai_pending_build` is not a database publishing guard.
- None of the linked SQL has been executed as part of this review package,
  and the live acceptance criteria remain unverified.
