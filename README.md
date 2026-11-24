# SitoMax

Websites that work as hard as you do.

The platform runs at `app.sitomax.com`; the apex domain serves the configured
marketing tenant, and client sites use subdomains or verified custom domains.
See [docs/HOSTING.md](./docs/HOSTING.md) for host routing and environment setup.

Use Node.js 22.x locally and in Vercel. The npm override pins jsdom to 26.1.0
so the server-side rich-text sanitizer can load without requiring the ESM-only
`@exodus/bytes` package.

## Local database tests

On Debian with `apt-get`, `dpkg-deb`, and `openssl`, the test harness downloads
PostgreSQL 17 and pg_cron into the ignored `.test-db/` directory without
installing system packages. It creates a disposable cluster with a generated
local password and binds only to `127.0.0.1:55439`. Do not put real data in it.
The Supabase auth and storage shims are minimal test substitutes, not a full
Supabase installation.

```sh
export TEST_DATABASE_URL=postgresql://sitomax_test@127.0.0.1:55439/sitomax_test
bash scripts/test-db.sh reset  # drops only this local test database and applies every migration
PGPASSFILE="$PWD/.test-db/pgpass" .test-db/install/usr/lib/postgresql/17/bin/psql \
  "$TEST_DATABASE_URL" -w -X -v ON_ERROR_STOP=1 -f supabase/tests/blog_scheduled_publishing.sql
bash scripts/test-db.sh stop
```

`start` starts the cluster without resetting it. The script accepts only the
exact local test URL above and never reads `.env.local` or production keys.
`supabase/tests/ai_agent_apply.sql` covers the AI agent's transactional apply
and site-wide undo, including access control. `supabase/tests/ai_agent_limits.sql`
covers the per-account agent limit, credit charging and who can read
conversations and their cost. Every other `.sql` file in
`supabase/tests/` is a test that passes against the latest schema, except
`local_shims.sql`, which `reset` applies itself to stand in for Supabase's
built-in schemas.

`supabase/tests/ai_agent_apply_editor.test.ts` is a Vitest test over the same
database. It stages theme, header and section changes with the agent's tools,
applies them, reads the drafts back the way the editor opens a page, then
undoes them and checks the originals are back. It is skipped unless
`TEST_DATABASE_URL` is set, and rolls back everything it writes:

```sh
TEST_DATABASE_URL=postgresql://sitomax_test@127.0.0.1:55439/sitomax_test npm test
```

## Platform appearance

The dashboard, authentication screens and editor share the warm neutral,
charcoal and restrained violet styles in `app/platform.css`. Shared panels
and controls use the `platform-panel` and `platform-button` classes; editor
chrome also uses Puck's documented theme tokens. Keep platform styling
inside `.platform-ui` or `.platform-editor`. Public tenant pages and the
editor's preview iframe retain each site's own colors, fonts and content.
The dashboard derives its accent from the agency primary color, adjusting the
display shade when needed for contrast. Desktop navigation can be collapsed;
on phones it opens as a keyboard-accessible drawer. Agency-only navigation
remains restricted to super admins.
Uploaded agency logos replace the sidebar name with an aspect-preserving wordmark;
the branding preview uses the same presentation. Use tightly cropped artwork
(preferably a transparent, wide logo). Without a logo, navigation shows the
agency initial and name. The mobile launcher is hidden from the desktop breakpoint.

Dashboard keyboard users can skip directly to the main content. Wide management
tables use named, focusable scroll regions, including on mobile; screen-reader
labels remain contained inside those regions. The dashboard clips page-wide
horizontal overflow without disabling table scrolling. Auth fields use a
16px default font size to avoid focus zoom on iOS; compact dashboard fields also
use 16px on phones without reducing larger editor headings. Site and blog tabs
and page actions wrap on narrow screens, with larger mobile touch targets.
Navigation and detail dialogs use
native modal focus handling and prevent background scrolling. Loading skeletons
respect reduced-motion preferences. Overview and Analytics share the same traffic
chart and accessible daily-values table.

Clients and leads open in dedicated detail views, with a back link that retains
the list filters and page. Existing lead links continue to open the lead directly.
Domain Requests uses an accessible detail drawer. Client access labels reflect actual owner
memberships, not invitation acceptance (which is not tracked). Completing a domain
request remains separate from verifying its DNS.

Forms supports website, rolling date-range, read-status and text filters.
Search checks all submitted JSON fields, including custom forms; CSV exports use
the same filters and include all matches from accounts the user owns (or all
accessible accounts for super admins). Editors cannot export leads; the export
route enforces this server-side and export actions are hidden. Normal browsing
uses database pagination. Arbitrary-field searches scan authorized, filtered records in batches
on the server because PostgREST cannot filter a JSON-to-text cast; only the
requested result page is sent to the browser. At larger submission volumes,
indexed full-text search would require a separate migration.

Analytics keeps UTC reporting and labels visitor counts as the sum of daily
uniques, not a deduplicated monthly audience. Empty periods do not show synthetic
traffic charts or conversion rates. AI Usage & Costs shows recorded client costs
for the selected UTC month separately from current-month allocation and held
reservations. All spending is estimated from configured token rates, not confirmed
billing charges; internal agency usage is excluded from client reports.

Agency Settings groups the existing profile, logo and accent controls with a live
branding preview. Unsaved changes warn on refresh/close and ordinary navigation
links; successful saves establish a new discard baseline. Reporting timezone and
account access are shown as information rather than unsupported preferences.
Agency branding and website editor color controls accept six-digit hex values;
press Enter or leave the field to apply the color.

The website editor uses save-aware page switching, a compact action bar and
keyboard-accessible tool rail and Content / Design / Motion tabs. History,
theme and commands live in More; Puck's native device and zoom strip remains
directly below the header. Panels retain native resizing with bounded widths;
tablets show one side panel at a time. **Dashboard** in the editor header
saves changes before returning to the workspace. Phones offer a saved-draft preview
instead of squeezing in the desktop workspace. Empty pages can use the existing
AI builder or section library, including saved designs. Theme editing uses the
shared detail drawer; the media picker is a native modal so it also works above
other dialogs. In the Theme panel, colour palettes, font pairings, button shape,
corners and the space between sections each change the whole site in one click,
with no AI request and no credits; they preview at once and are kept with
**Save theme**. The presets live in
[lib/theme/quick-styles.ts](./lib/theme/quick-styles.ts), and the AI chat points
to them. `sites.theme.spacing` (`compact`, `comfortable`, `spacious`) sets
`--section-pad`; an unset value keeps the style's own spacing. These changes do not alter tenant rendering, AI requests, credits,
autosave, undo history, or publishing.

Dashboard Edit/Open editor links (including blog post edits), previews and live-site
links open in a new tab; the editor's **Dashboard** link stays in the same tab.
Apply `supabase/migrations/0045_editor_concurrency.sql` before deploying this editor:
it adds page versions and account-authorized editor-session heartbeats. Website pages
warn when another tab or user is editing (refreshed every 15 seconds and when the
tab becomes visible again). Closing or reloading a tab ends its session at once
through a beacon to `/api/editor/presence`, a platform-host-only route that closes
only the caller's own session; sessions that cannot send it expire after 45
seconds. If a check fails or is overdue the warning is replaced by a notice that
other editors could not be checked, rather than left on screen. Saves, publishing, AI edits and history restores
check the loaded page version atomically, including shared header/theme transactions.
A stale save retains the local canvas, stops subsequent saves and prompts a reload;
copy any unsaved changes before reloading. Published content is unchanged by presence
checks or rejected saves.

The editor tool rail uses compact, color-coded icons while retaining their
existing click targets and selection indicator.

Owners and agency admins can open **Domain** in the editor header or tool rail
to save their draft and open the site's existing domain settings. **Back to
editor** opens the page they were editing in a new tab.

Select words directly inside editable canvas text to replace them. Section headings
and body copy open the floating formatting toolbar, including heading levels 1–6.
Existing plain section headings keep their original heading level. Button labels
remain plain-text fields.
Formatting dropdowns stay open while focus leaves the canvas; click outside
the toolbar and text, or press Escape, to dismiss the toolbar.
Use the section toolbar's drag handle to reposition a section instead of dragging
its content.

Rich-text editors opt out of Grammarly overlays, which can intercept canvas
clicks and focus the draggable block instead of its text. Existing injected
layers are hidden only inside editable canvas fields. These protections do
not change saved content or disable native browser spell checking.

### Site-wide headers

Run `supabase/migrations/0028_global_headers.sql` after `0027`, then reload the
editor. Until it is applied, the app logs the missing migration, shows an editor
notice and preserves legacy Navigation rendering, editing and generation.
Headers live in `sites.draft_header` /
`sites.published_header`, using the versioned contract in `lib/header.ts`.
The migration independently chooses draft and published Navigation (Home first,
then page order), removes per-page copies, and keeps untouched drafts as
**Before global header migration** entries in editor History. Restoring a version
with Navigation recovers that original block, including its design, in page-local
compatibility mode and suppresses the global header so it cannot appear twice.
**Use site-wide header again** returns that page to the shared header in one undoable
step. Restoring newer header versions affects the site's draft header across all
pages. The editor's publishing panel lets you publish the current page or choose
site-wide changes; header and theme drafts are promoted only when their checkboxes
are selected. Footer blocks remain page content and publish with their page.
The Pages panel marks unpublished pages and pages with pending edits as Draft.

Click or right-click the header in the canvas for Content, Design, layout,
hide-on-page and clear-padding actions. The settings drawer follows the current
desktop/tablet/mobile canvas. Eight desktop layouts and three compact layouts
preserve content and colors when switched. Tablet follows desktop or mobile,
with independent style overrides. Custom menus support one level of sub-items
and the shared Link Picker; automatic menus follow Pages labels, order and
visibility. Business info supplies contact details and social profiles.

Page settings also offer **Hide header on this page** and **Transparent header
over hero**. Header saves use an atomic, permission-checked RPC and reject
conflicting edits from other tabs. Header changes are included in version
history and undo. Native modal mobile menus
trap focus, close with Escape and return focus to their trigger; dropdowns
support Tab, Arrow Down and Escape. Header text/hover/menu-panel/scroll colors
are contrast-adjusted; image, gradient and transparent backgrounds use solid
text backings for predictable AA contrast.

**Ask AI** in the header toolbar opens the AI site agent focused on the
site-wide header; it changes only validated layout/style settings and goes
through the agent's review, apply and undo. Templates and both AI generation
modes are normalized at the database boundary so their Navigation initializes
a missing header without replacing an existing site header.

### Blog management

Apply `supabase/migrations/0029_blog_phase_a.sql` in the Supabase SQL Editor
after `0028_global_headers.sql`, then apply
`supabase/migrations/0030_blog_public_settings.sql`. Each site's dashboard
includes a Blog manager for posts, categories, authors, SEO settings and
site-local scheduling. Public blog routes, feeds and SEO use published
snapshots. Apply
[`0039_selective_site_publishing.sql`](supabase/migrations/0039_selective_site_publishing.sql)
after the preceding migrations to enable selective site publishing and staged
blog defaults. Blog default and timezone edits are saved as drafts and become
public only when **Blog settings** is selected in the editor's Publish panel.
To show recent articles on an existing page, open the website editor and choose
**Add section → Blog → Latest blog posts**, then publish the page. The live feed
updates automatically as posts are published. Post links and **View all posts**
stay on the same tenant when clicked from the page preview.
The editor canvas previews published posts using their thumbnail (or cover image)
and saved excerpt. Select the section to change its heading, layout, or post filter.
To change an image on an already published card, choose a thumbnail under the
post's **SEO** tab (or a main image under **Details**), then republish the post.
Use **Back to editor** in Blog Manager or the post writer to return to the
page you started from. If you opened the blog directly, it returns to the
site's home page (or its first available page).
In the Posts table, use **More** for actions such as duplicating or deleting
a post.
In the post writer, use **Add text** to write with a formatting toolbar,
**Add button** to insert a labeled link, or **Insert block here** to add
content between existing blocks.

If Blog Manager shows a server error, check the deployment runtime logs for
`Could not load Blog Manager data`. Verify both blog migrations are applied
to the database used by that deployment.

Apply [migration 0031](supabase/migrations/0031_blog_import.sql) after 0030
to enable Blog Manager → Import. Preview a WordPress XML export or an RSS/Atom
feed before writing any posts. Imports default to drafts and skip existing
slugs; overwriting and retaining published status are separate opt-ins.
Sources are limited to 2 MB and 250 posts. Feed URLs must be public HTTPS;
unavailable or unsupported images are omitted and reported.

Apply [migration 0032](supabase/migrations/0032_blog_scheduled_publishing.sql)
after 0031 and before deploying scheduled publishing. It registers the
`publish-due-blog-posts` job in Supabase Cron (`pg_cron`) to run every minute
and publish up to 100 due posts per run. Check the job's run history in
Supabase Cron after rollout. Scheduling captures the current version;
later edits stay in the draft unless you reschedule. Cancel the schedule
before changing the post URL. Posts scheduled before 0032 must be
rescheduled with a future time; they are not published automatically.

Apply [migration 0033](supabase/migrations/0033_blog_analytics.sql) after
0032 and before deploying Blog Analytics. Account owners and super admins
can open **Blog Manager → Analytics** for post views and top posts over
7, 30, or 90 UTC days. It uses the existing first-party analytics beacon
and requires the same `ANALYTICS_HASH_SALT` setting. Preview and signed-in
site team visits are excluded. Post views start counting after deployment;
historical traffic is not backfilled.

The blog writer offers credit-metered AI draft, selected-text rewrite, and SEO
suggestion previews. Review the verification notes before applying any
suggestion. Alt text suggestions use the supplied description, not the image.

## Internal agency sites

**New site** opens a choice between **Build with AI** and **Start with a
template**. AI creation has Business, Pages, Design and Review steps and saves
unpublished drafts. Template creation has Client, Template, Business details
and Review steps; **Create and publish site** publishes the template pages
immediately. Both flows keep entered values when moving back between steps.
The AI builder groups optional business context in an expandable section and
requires separate confirmation before replacing drafts or updating shared
Business information on an existing site.

Apply `0019_internal_account.sql` in the Supabase SQL Editor after migrations
through `0018`. Opening **New site** or **Build with AI** as a super admin
creates the single agency account, named by `NEXT_PUBLIC_AGENCY_NAME` (default
`SitoMax`), and adds that admin as its owner. Choose **SitoMax (internal)**,
shown first, for agency-owned sites. Existing sites are not moved automatically.
Only this account can create sites using `MARKETING_SITE_SUBDOMAIN`.

The internal account cannot receive client invitations and is excluded from
Clients, client AI usage/credit limits and client cost reports. Agency AI usage
is still recorded, with existing request rate limits but no credit quota.
The dashboard greeting and header date use the browser's local timezone;
reporting periods continue to use UTC.

## Editor AI and business information

Apply migrations through `0013_site_business.sql` in order before using this version.
Owners and editors can maintain a site's business information in its dashboard
settings or the editor's Theme panel. AI site generation saves the supplied
business details alongside its drafts. Editor AI sends that information and
the requested content to the configured AI provider; each attempt is metered.
Review generated content and placeholders before accepting or publishing it.
AI-created sections use stock photos when configured, otherwise image placeholders.

### Build an empty page

Choose **Build this page with AI** in the editor's **Pages** panel or on an empty
canvas. Generation uses the site's saved business information, current theme and
page links, retaining shared navigation/footer styling. It saves only a draft;
review the result before publishing. Nonempty pages are never replaced, and a
concurrent draft change cancels the save. Each AI attempt is metered.

### AI site agent

Apply [0046_ai_agent.sql](./supabase/migrations/0046_ai_agent.sql),
[0047_ai_agent_apply.sql](./supabase/migrations/0047_ai_agent_apply.sql) and
[0048_ai_agent_limits.sql](./supabase/migrations/0048_ai_agent_limits.sql) after
the preceding migrations. Apply `0048` right after deploying this version, not
before: the previous version reads run columns that `0048` closes to client
sessions, so its AI chat would fail until the deploy. Until `0048` is applied
the per-account limit is not enforced. Open the AI chat from the editor's top bar
(Ctrl/Cmd+J, or Ctrl/Cmd+K outside a text field), a section's toolbar or menu,
the header toolbar, or **Ask AI** in the section library, which passes the
insert position. The agent stages changes across pages, the theme, header,
footer and blog drafts, and previews them in the canvas without touching drafts.

**Apply to drafts** writes the kept changes in one database transaction and
records an **AI edit** in each touched page's history. Changes are rebased on
the current drafts first: a change to content that was edited since the run,
or that depends on a change you undid, is skipped and listed. Menu labels and
visibility of published pages are live settings and are never changed by the
agent. Nothing is published.

Drafts have no tables of their own. Apply and undo write the columns the editor
opens and Publish reads: `pages.draft_data` (which includes each page's copy of
the shared footer), `sites.draft_theme` and `sites.draft_header`; every page
write also changes `pages.draft_version`. `EDITOR_DRAFT_SOURCE` in
[lib/editor/initial-data.ts](./lib/editor/initial-data.ts) names these columns,
and both opening a page and refreshing it after an apply or undo read through
`editorDraft` there. After either, the open page, theme and header are replaced
in the editor as one undoable step without a reload, the unpublished-changes
count is refreshed, and a confirmation such as "16 changes applied" is shown.

**Tool input.** A tool call the model gets slightly wrong should not cost a
retry. Three things keep first attempts from being refused:

- *The model is shown exact shapes.* Each tool's description lists its keys,
  allowed values and an example, and the schema sent for theme, header and
  design input is the real one rather than an open object. A shape is spelled
  out once: the footer's design points to `update_section_design`, a new
  page's custom layouts to `insert_section`, and a blog edit's blocks to
  `create_blog_post_draft`. Schemas are sent without what only a validator
  reads (`compactSchema` in [agent-tools.ts](./lib/ai/agent-tools.ts)).
- *Common slips are read as what they mean*, before validation
  ([lenient-input.ts](./lib/ai/lenient-input.ts),
  [agent-normalize.ts](./lib/ai/agent-normalize.ts)): numbers written as text
  or with `px` or `rem` (`"8px"`, `"1.5rem"`); options written as numbers or in
  another spelling (`24` for `"24"`, `2` for `"h2"`, `"Center"`); objects and
  lists written as JSON strings; one item where a list is expected; other
  names for the same setting (`textColor` or `backgroundColor` at the top of a
  design, `padding` without a device, `page_id`); settings sent beside the
  object they belong in; and, in custom layouts and list items, required
  settings left out, which get the editor's defaults. An icon outside the
  curated set becomes the closest curated one, or `check`.
- *Unknown keys are left out, not refused.* The call goes ahead, the result
  tells the model what was ignored in `notes`, and a warning
  (`AI agent tool input was adjusted`) is logged. A call still fails when
  nothing in it can be applied, or when a value is wrong in a way that has no
  plain reading: percentages, words such as `"large"`, out-of-range numbers,
  unknown fonts, images that were not chosen with `set_image`, embed code.

An edit that changes nothing is answered as such and is not an error.

**Steps in the chat.** Clients never see a tool's error text or ids. When a
call is refused for the way its input was written, the agent is asked to
repair it, and the attempt and its repair are shown as one step that worked.
The repair is made by the small model; if that is refused too, the main model
has one last try. A run may ask for five repairs in all, over every tool and
every Continue: a tool that works again gets its three attempts back, so
without that a run could go on slipping and repairing until its steps ran out.
After the fifth, the next refused input fails its step and pauses the run. A
step turns red, with "This step could not be completed.", when it was refused
for any other reason, when the last try was refused too, when the run's
repairs are used up, or when the run ended without a repair. Agency staff also get **Details** on such steps, with
the technical message the model was given. The editor's context
for a message (the selected section, an insert position) is sent to the model
apart from the user's words and is not stored or shown as part of them, and
ids are removed from plan steps and questions before they are shown.

**Pages and sections.** The agent addresses a section by its `pageId` and
`sectionId` together, because the same section id can exist on several pages.
The site overview lists the section ids of every page. Each section tool checks
the pair before it changes anything; on a mismatch it answers with the pairs
that do exist (the page the section is really on, or the sections of the page
named), so the agent's one repair attempt can succeed. A slip that was repaired
no longer counts against later steps of the same run.

**Footer.** There is no site-wide footer yet: every page holds its own Footer
section. `update_footer` therefore finds the Footer section on each page and
applies the same change (content, design or both) to all of them, keeping
whatever else differs between them, and reports any page that has no footer.
It is reviewed as one change. On apply each page's footer is written
separately, so a footer edited by hand since the run keeps that edit and is
reported, while the other pages still get the change. Pages the agent creates
start from the changed footer. Section tools refuse a footer id and point to
`update_footer`. Runs staged before this, which changed only a shared copy,
still apply as before.

**Plans.** A request that goes beyond one page, or beyond three sections (the
theme, header and footer count as one each), needs an approved plan. The agent
is told so, and the rule is also kept for it: a change that would cross that
line without a plan is not run, and the agent is sent back to plan what is
left. It is told twice at most, so a run never hangs on the rule.
Once a plan is approved it is tracked in the run until every step is
done. The agent reports progress with `report_progress`, and a step it cannot
do must be reported as skipped with the reason. If the agent ends its turn with
steps still open it is told to carry on; if it still does not, or a run limit is
reached first, the run is paused and the panel lists what is still to do with a
**Continue** button. A finished run lists any skipped steps with their reasons.
A run never ends looking complete while approved steps are open. A reply cut
off by the output limit is resumed instead of being treated as the end.

**Undo these changes**, on the applied card and under **History → AI changes
across the site**, reverses one apply across the whole site in one transaction.
Any member who can edit the site may undo. Items edited or published since are
skipped and listed with links; pages and posts the agent created are deleted
only if they were never published and are unedited. Undo is available for 30
days, or until the changes are published; after that, restore a published
version from History. History shows who applied and undid each set of changes.

The former Ask AI panel and floating "Add a section with AI" prompt were
removed. **Rewrite with AI** for selected text is unchanged.

**Quality check.** When a run finishes, the site before and after its changes
is compared. Problems the changes introduced are repaired where that is safe:
text colours that became hard to read, empty text blocks and buttons, and menu
labels that cannot be used. Each repair is staged as a **Quality fix** change,
reviewed and applied like any other. Links that lead nowhere, placeholders left
to fill in, pages sharing a menu label and a crowded menu are listed on the
review card under **Check before publishing**. Problems that were already on
the site are left alone. Text colours are only judged where the background
behind them is known, so text over an image or video, or inside a curated
block, is never recoloured.

**Cost and limits.** A run costs one included edit, or 1 credit beyond the
monthly allowance, and 3 credits once it makes more than 10 changes (the app
asks first). After a run the panel shows clients what it cost in credits; the
agency also sees token counts, the provider cost and, under **Cost details**,
where the money went: system prompt, tool definitions, site overview, page
reads, tool results, conversation and output, each in tokens and dollars, with
how much of the input was read from the cache, written to it or sent uncached,
and what each model was used for. The same numbers are logged for every run
as `AI agent run cost` (no site content). The provider reports tokens per
request, so each request's prompt tokens are divided over its parts by size
and priced in the order the provider reads them; per part the figures are
estimates, and their total is the run's exact cost
([agent-cost.ts](./lib/ai/agent-cost.ts)). Every request is priced on its own
at its own model's prices. Provider cost, token
counts and the saved model conversation cannot be read with a client session;
`0048` also closes the per-request usage ledger (`ai_usage`) to account owners,
who keep seeing their allowance and credits.
Each client account may send 30 agent requests an hour and 150 a day, counting
every message, answer, plan approval and Continue; agency staff are exempt.
Change the numbers per account in `ai_limits.agent_requests_per_hour` and
`agent_requests_per_day` (0 turns the agent off for that account). When the AI
service is busy or does not respond, the run is paused with its progress saved
and **Continue** retries it without a new charge; the agency also sees the
Anthropic error type.

**Models.** Edits to what is already there go to the small model
(`SMALL_EDIT_MODEL`): rewriting text, restyling, alt text, moving or removing a
section, a page's title, menu label and SEO fields, on one page and up to three
of its sections. Planning, new sections and pages, the theme, header, footer
and blog, and anything across pages go to the main model
(`SITE_GENERATION_MODEL`). The words of a request, and whether a section is
selected, only decide where a run starts
([agent-route.ts](./lib/ai/agent-route.ts)). What keeps quality is what the run
turns out to be. The small model gets only the tools for small edits and a
`hand_off` tool for everything else, and its reply is dropped and the main
model answers instead when it hands off, reaches beyond one page or three
sections, has its input refused twice, is still going after eight steps, or
ends without changing anything (a question, or a request it could not carry
out). A run never moves back to the small model, except for the one request
that repairs a refused tool input. Its text is shown only once its reply is
kept. The run log names the model a run started with and why it was taken over.

**Memory and input size.** Each request to the main model is sent in the order
the provider caches it. The tools and the rules come first and never change, so
they are shared by every site and kept for an hour. The site overview opens the
conversation and stays as it was first sent for the whole run, also for an
hour, so a run that waits for a plan approval and the next request in the
session still read it from the cache. The conversation follows and only grows;
it is marked up to its end with the five-minute cache, so each step reads the
previous one's and adds its own. The small model's requests are cached the same
way, with its own, shorter tools and rules. Cached input costs a twentieth of
fresh input on the main model and a tenth on the small one; the prices in
[pricing.ts](./lib/ai/pricing.ts) are entered by hand from Anthropic's
published pricing, which the file cites. A repair request shares the cached
tools and rules but writes nothing of the conversation, which its model will
not read again.

The overview is a compact map: every page with its menu label and status, and
each section's id, type, design and first fifteen words, plus the theme, the
business facts and a summary of the header, footer and blog. It holds no
section's properties. What the agent changes afterwards is in its own tool
results; `get_site_overview` returns the site as it is now, and the overview is
refreshed whenever the conversation is shortened. `get_site_settings` reads the
header, footer, site SEO or blog settings, and returns only the settings listed
in `SITE_SETTINGS_FIELDS` ([agent-tools.ts](./lib/ai/agent-tools.ts)): what a
visitor can see on the site. The site's analytics, pixel and verification ids
are not among them, and nothing about billing, domains or accounts is loaded
for the agent at all. A new setting is unreadable until it is added to that
list. `get_page` returns a page's
content (text, links, images and whole lists; empty properties are only named)
and `get_section` one section in full, with its layout options, design and
nested element ids. Content that was read in the run and has not changed since
is not sent again. A change is answered with `ok`, the ids of anything new and
the names of what changed, never with the content; a new curated section
returns only the sample content the call did not replace.

A conversation is carried into the next request whole while it is short. Once
it holds more than six requests, or is longer than about 12,000 characters, it
is replaced by a short note (at most about 2,400 characters) of what was asked,
answered and done, the changes still staged with their pages, and plan steps
left unfinished. The model's reasoning is never sent back to it. When a run's
conversation grows past about 60,000 characters it is shortened once: older
tool results go, the page being worked on stays. The per-run token allowance
counts cached input at a tenth. Closing summaries are limited to about 120
words unless the user asks for more.

**Evals.** `node scripts/agent-evals.mjs --dry-run` checks the eval harness
with a scripted model and sends nothing to the provider.
`node scripts/agent-evals.mjs` runs sixteen sample requests against a fixture
site with the configured API key (about $0.50 of provider credits, more when the
model plans a larger job; `--budget` caps the total, 3 USD by default, and one
request may use a quarter of it) and checks that each staged changeset validates,
invents no facts and keeps AA contrast. It ends with the number of tool calls
that were refused on their first attempt, which is the number to keep down, and
the cost of each kind of request: `section` (edits to what is in a section or
two), `page` (adds to or rewrites one page), `site` (across pages or shared by
them) and `blog`. `--only faq,blog` runs selected requests, `--costs` prints
each request's cost breakdown, `--verbose` adds each step and each model
request with what the cache read and wrote, and `--out run.json` saves the
results to compare one run with another. Evals run in the agent's sandbox:
they read and write no database and fetch no images.

What a request costs, measured with the evals on the fixture site before and
after the agent's input was cut down and small edits were given to the small
model (November 2026, at the prices in [pricing.ts](./lib/ai/pricing.ts); all
sixteen requests passed their checks in both runs, with no refused tool call):

| Request type | Requests | Before: average (highest) | After: average (highest) |
| --- | --- | --- | --- |
| `section` | 5 | $0.028 ($0.039) | $0.003 ($0.005) |
| `page` | 6 | $0.063 ($0.138) | $0.032 ($0.044) |
| `site` | 4 | $0.075 ($0.168) | $0.056 ($0.140) |
| `blog` | 1 | $0.034 | $0.026 |
| All sixteen | 16 | $0.85 in total | $0.46 in total |

The "after" run started with an empty cache, so its first main-model request
also wrote the tools and rules to the one-hour cache: $0.09, once an hour for
all sites together, which fell on the most expensive `site` request. Without
it the `site` figures are $0.032 ($0.068). The "before" run started with a warm
cache and paid no such write. The targets are $0.02 for a `section` request and
$0.20 for a `site` request. Costs vary from run to run with how much the model
decides to change; compare several runs before drawing conclusions from one.

Those `section` figures are from before the small model's requests were
cached. With caching, the same five requests cost $0.0007 on average ($0.0004
to $0.0011) when the cache is warm, and $0.0011 on average in a run that
started cold, whose first request also wrote the small model's tools and
rules to the cache ($0.0016, once an hour for all sites together).

### Stock photos

Apply `0020_stock_photos.sql` and `0021_media_library.sql` after `0019` and set
server-only `PIXABAY_API_KEY` locally and on Vercel. Every **Choose image** or
**Replace image** control opens the shared media picker, including section
backgrounds, nested block images, site/agency logos and SEO images.
Its default **Stock photos** tab searches Pixabay. Previews carry a
**Photos from Pixabay** link; selecting a photo
downloads the largest available suitable file (up to 20 MB) into the site's
`site-assets` folder. AI site generation and AI-added sections use the same
provider interface in `lib/photos/`. Published pages use our Storage URLs, never
the Pixabay preview URLs, and do not display new photo credits.

Searches use safe photo results, support landscape/portrait/square filters and are
cached for 24 hours. Database locking enforces a shared rolling limit of
100 uncached searches per 60 seconds across app instances. No matches or failed
AI downloads leave placeholders with review warnings; editor failures are shown
without changing the current image. Existing Unsplash images and their attribution
remain until their image is replaced; `UNSPLASH_ACCESS_KEY` is no longer needed. Full-resolution Pixabay
downloads require full API access; otherwise the largest returned size is used.

The picker also offers drag-and-drop/browse uploads, a newest-first site media
library with filename/alt-text search and pagination, and a server-authorized
**Paste URL** tab for super admins only. Alt text starts from Pixabay tags or
the upload filename and is editable before selection. Existing uploads remain
visible; assets uploaded before metadata support have no searchable stored alt
text. Site uploads allow JPEG, PNG, GIF, WebP and AVIF up to 50 MB (no SVG);
agency branding uploads retain the 2 MB PNG/JPEG/SVG/WebP limit. Uploads go
directly to Storage under its existing authenticated RLS, avoiding application
request-body limits. The library function checks site membership or super-admin
access before reading Storage metadata. Agency stock images use the internal
account's folder; its library also includes the agency-only branding bucket.

### AI diagnostics

To diagnose the provider locally with a configured API key, run
`node scripts/test-anthropic.mjs` for a small message using the site's model.
Add `--generation` to test planning and four page requests with synthetic
details and no database writes (this uses provider credits). Add `--dry-run`
to check the planner and four synthetic page schemas without sending requests.
The planner is strict; page fills are non-strict and get one Zod-driven repair
before the run stops without saving drafts. The diagnostic prints tool metadata,
not prompts, business details or keys.
For SitoMax designs with preset pages, run
`node scripts/test-anthropic.mjs --curated --plan-only` and then
`node scripts/test-anthropic.mjs --curated` (Home, Features, Pricing, Examples,
About and Contact with FAQ and Pricing; prints each page's section and word
counts, add `--show` for the generated props). Curated pages are built from the
page-type blueprints in [`lib/ai/page-blueprints.ts`](lib/ai/page-blueprints.ts):
the model picks the theme, copy and preferred designs, and the application
guarantees the selected pages, their core sections and a closing call to action.
New AI site builds use these curated designs; Original Custom Layout is no
longer offered for new builds. Previously unfinished custom pages can still be
retried, and existing custom layouts remain editable.
Provider errors are logged centrally and sanitized details are shown only to
super admins.
For existing Original Custom Layout retries, apply
[`0024_custom_generation_call_budget.sql`](supabase/migrations/0024_custom_generation_call_budget.sql)
before using per-section generation. The generation still consumes one credit;
section calls and repairs are metered against the same generation. To verify
with synthetic details and no database writes, run
`node scripts/test-anthropic.mjs --custom --home-only` and then
`node scripts/test-anthropic.mjs --custom` (four pages with FAQ and Pricing).
Apply [`0025_page_menu_labels.sql`](supabase/migrations/0025_page_menu_labels.sql)
before deploying automatic site menus. Edit a page's short **Menu label** in
the editor's **Pages → This page in menus**; this does not change the page or SEO
title. Live menus only list published pages; draft previews can link to other
drafts. New custom drafts use the shared footer and saved business contact
details. The editor displays automatic checks under **AI draft review notes**.
The diagnostic prints validation paths, codes, messages, and truncated received
values. Production logs use the request reference and record the received type
or length instead of generated text. Only super admins see validation issues in
the wizard.

Apply [`0026_selected_ai_pages.sql`](supabase/migrations/0026_selected_ai_pages.sql)
before deploying the page picker. AI builds use only the selected pages,
in the chosen order. One generation covers up to six pages; pages seven
through ten cost two shared credits each. Super admins are unlimited.
Successful drafts are saved even when another page fails. Retry unfinished
pages for free from the summary or by reopening **Build pages with AI**.
Unticked drafts and published content are not replaced. Use **Hide from menus**
in a page's **⋯** menu to remove it from navigation without unpublishing it.

Apply [`0037_ai_draft_checkpoints.sql`](supabase/migrations/0037_ai_draft_checkpoints.sql)
in the Supabase SQL Editor before deploying the generation quality/checkpoint
updates. After planning, generation creates recoverable page/retry records and
one draft backup, then saves each accepted page immediately. Existing drafts
stay intact until their replacement passes validation; concurrent edits are
never overwritten. New sites are created as unpublished drafts before body
generation. If a run is interrupted, reopen the site's **Build pages with AI**;
unfinished pages become available for free retry after the 15-minute active-run
window. Unknown provider usage remains reserved for reconciliation.

AI-generated pages require one H1, at least 30 words of substantive supporting copy
(excluding headings, menus and placeholders), a working body button or form,
and one final footer before a page is marked **Built**. Failed checks receive a
bounded repair attempt; rejected pages remain retryable, not successful.
Custom headings are normalized into a single-H1 hierarchy; section links use
rendered anchor IDs. Custom text preserves paragraphs, line breaks, bold and
emphasis; unsupported Markdown is rejected for repair.

Generated pages reuse the Home draft footer (then another saved footer, including
published fallbacks) with fresh block IDs, keeping its layout and introduction.
A new site uses one consistent footer design without stock business claims.
Footer contact details, menu links and saved social profiles come from site
metadata. Confirming edits to Business information in the wizard updates those
details site-wide, including on published pages; this is separate from draft
replacement confirmation. Saved social profiles are preserved, and concurrent
Business edits require reloading rather than being overwritten.
Always review copy, photos, placeholders and desktop/tablet/mobile layouts before
publishing; these deterministic checks are not a visual or factual guarantee.

### Pages and links

The editor's **Pages** panel creates pages (blank, a copy of another page, or
built with AI) and has a **⋯** menu per page to rename it, edit its slug,
duplicate it, set it as the homepage, hide it from menus, move it or delete it
(the homepage can't be deleted). Drag pages, or press Alt + ↑/↓, to reorder
them; the order drives header and footer menus. There are no per-plan page
limits. Changing a slug can add a 301 redirect from the old address.

Buttons, menu and footer links, image links and rich text (Link button or
Ctrl/Cmd+K) all use one link picker: a page (with an optional section), a
section on this page, an external URL, email, phone or a file. Page links are
stored by page ID and resolved to the current slug when rendered, so they
survive renames. Older typed links such as `/about` are rewritten in other
pages' drafts when a slug changes, except when you swap the homepage. Give a
section an anchor in **Design → Settings → Anchor ID**. Publishing first lists
links to deleted pages, missing sections or invalid URLs.

The rich text toolbar appears on field focus, stays anchored above the text box
(or below when space is limited), and hides on blur, outside click or Escape.
Only one toolbar is visible at a time. Icon controls have shortcut tooltips
and wrap on smaller screens. Typography, alignment and line height stay in
dropdowns; the palette contains colors and custom sizes. With no selection,
font, size and color apply to the current paragraph; inline formatting and
highlight affect the next typed text. Select text and use **Link** or
Ctrl/Cmd+K to open the picker. Without a selection, a hint explains what to do.
Click a linked word to view its destination and Edit, Open or Remove it.
**Rewrite with AI** remains a separate accent action for selected text.

Click a configurable content icon (hero badges, service cards, process steps,
statistics, callouts, icon lists or standalone icons) to open the searchable
icon library. The same picker is available in the inspector, with optional
size and theme/custom color overrides. Apply records one undoable draft edit;
Cancel leaves the icon unchanged. Existing name-only icons keep their design's
size and color. AI generation uses validated curated icon names and chooses
them by the item's meaning rather than relying on a generic star fallback.

Apply [`0027_site_files.sql`](supabase/migrations/0027_site_files.sql) to allow
PDF and Office file uploads and file links (20 MB limit).

## Analytics

Apply `0014_analytics_reporting.sql` after the preceding migrations and set
`ANALYTICS_HASH_SALT` to a random secret of at least 32 characters on the
server. Rotate it if compromised; doing so changes visitor identifiers.
The beacon requires the client IP in `x-forwarded-for` as supplied by Vercel;
other deployments must ensure their trusted proxy overwrites this header.
Without a valid IP or salt, the endpoint fails closed. It stores paths without
query strings, referrer origins only, device, country, and a site-specific
hash that rotates daily; it never stores the IP. Date ranges use UTC calendar
days including today. Unique visitors are daily uniques summed over the range,
not deduplicated across days.
An invalid salt is logged once per server instance at startup and shown to
super admins on the Analytics page; visitors' data is not collected until fixed.

Draft previews and signed-in site members are excluded when their session is
available on the tenant host. Dashboard cookies cannot be sent to unrelated
custom domains, so a logged-in editor visiting a custom domain directly cannot
be identified and may be counted as a visitor.

## Contact submissions

Apply `0015_form_submissions.sql` after the preceding migrations. Published
tenant forms save submissions for account owners and the agency under
Dashboard → Forms. The endpoint requires a trusted proxy to overwrite
`x-forwarded-for` (as on Vercel); requests without a valid client IP fail
closed. It limits each IP to 10 submissions per site per 10 minutes, storing
only a keyed hash; expired rate-limit entries are removed on later submissions
after one day. Email notifications are not yet configured.

## SEO toolkit

Apply `0016_seo.sql` after the preceding migrations. Site members can open
the SEO tab on a site to manage social sharing, indexing defaults, tracking
IDs and redirects; page-specific settings live in the editor and become live
on publish. Structured data uses the existing business profile. Redirect
lookups are cached for up to 30 seconds, and browsers may retain 301 redirects
longer. The configured Supabase public storage origin is optimized by
`next/image`; other external image hosts remain unoptimized so existing image
URLs continue to work. Google Analytics and Meta Pixel load only when their IDs
are configured and never in preview; site operators are responsible for any
applicable consent requirements.
Each public site host serves its own `/sitemap.xml` and `/robots.txt`; the
platform host disallows crawling and does not provide a sitemap.

## Custom domains

Account owners and the agency can use **Domains** in the workspace sidebar to
open domain settings directly for one website or choose from multiple websites.
They can still click **Connect domain** directly on a site's dashboard card
(**Domains** if a domain is already attached), or click **Pages** on the card,
then the **Domains** tab. **Edit** opens the page
editor, not site settings. Editors cannot manage domains. Configure
`VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID` and, for team projects, `VERCEL_TEAM_ID`
on the server. The token must have permission to manage that project's domains;
never use a `NEXT_PUBLIC_` variable for it. Apply `0017_domain_wizard.sql`
manually after the preceding migrations. It adds protected connection tracking
and a private, database-enforced rolling request limit.

Enter a domain such as `example.com` (a leading `www` is treated as its alias).
The platform attaches both hostnames, with a permanent redirect from `www`
to the root. The DNS table uses the hosting API's preferred A and CNAME values,
plus any required TXT ownership challenges; no shared IP or target is hard-coded.
The guided wizard detects the DNS host from its nameservers (not necessarily
the registrar), lets you override it, and shows provider-specific instructions.
Unknown or shared nameservers can be selected manually. Provider logos, links,
instructions and optional `videoUrl` fields live in `lib/domains/providers.ts`;
add a trusted HTTPS video URL there to enable its help-video link.

Existing A and CNAME records are compared with the recommended values. The
warnings identify conflicting website records only; do not remove MX or
unrelated records. DNS lookups run on the server and each query counts toward
a rolling maximum of 20 per minute per signed-in user, shared across instances.
Missing DNS records are normal; timeouts and lookup failures are reported.

Click **I've updated my DNS** to start the waiting view. Checks run every
30 seconds while the wizard is visible, without overlapping, and stop on
connection, expiry or unmount. Hidden tabs pause foreground checks.
`vercel.json` also schedules `/api/cron/domains` every 15 minutes. Set a random
`CRON_SECRET` (at least 16 characters) on the server; the job fails closed without
its bearer header. The hosting plan must support this frequency. Pending checks
are paginated, oldest-first, and large batches resume on subsequent runs.
After 14 days automatic checks stop and show **Needs attention**; explicit
manual checks still work. Existing pending domains start their 14-day window
when the migration is applied. Both hostnames must pass ownership and DNS checks
before the custom domain becomes the live site URL.

**Retry connection** and scheduled checks reattach the saved domain or its
`www` redirect if either is missing from the hosting project, then refresh the
DNS instructions. If the domain is in use elsewhere, the wizard shows the TXT
ownership record when one is available. If no challenge is available, ask the
current project owner to release the domain before retrying.

Connected domains notify account owners through Postmark. Send failures are
logged and retried by later jobs with a short database claim. Postmark's send
API does not deduplicate retries: if it accepts a message but the acknowledgement
or the database update fails, a retry may send a duplicate. The same opaque
notification reference is recorded in message metadata for troubleshooting.
Existing live domains are marked notified by the migration to avoid retroactive
emails. Without email configuration, live notifications are skipped. The **Send these instructions to my
web person** form sends server-generated steps and current DNS records to a
validated address, limited to three sends per minute per user. Missing email
configuration is shown explicitly for this on-demand action.

Incomplete connections stay saved so **Retry connection** can finish setup.
Remove an existing domain before replacing it. Removal detaches both hostnames
before clearing the saved domain; retry if only part of the removal succeeds.
Removing a domain does not delete DNS records at the domain provider.

### Agency-assisted domain setup

Apply `0018_domain_requests.sql` manually after `0017`. In the domain wizard,
account owners can choose **Have us connect it for you**, select their provider,
and invite the agency's configured **support email** using limited delegated
access. Configure that address under Dashboard → Settings first; the form is
disabled when it is missing. No registrar credentials are collected. GoDaddy
folder restrictions, Namecheap DNS sharing, Cloudflare's domain-scoped Domain
DNS role and Squarespace domain-manager access are explained in the guide.
If a provider cannot safely limit access, use self-service DNS instead.

Owners can create and read requests for every site in their own account,
regardless of who submitted them. Editors cannot create or view requests.
These rules are enforced by RLS; owners cannot change request statuses or notes.
An open request for the same site/domain cannot be submitted twice.

The agency's **Domain requests** sidebar entry lists requests with client-visible
status and notes updates. Only super admins can update them. Marking **Done**
emails current account owners through Postmark. Failed
completion emails stay pending for the secret-authenticated 15-minute domain
job to retry. Missing email configuration is reported to the admin after saving
the status. Completion status does not bypass DNS verification or set a site's
`domain_verified` flag. Clients can refresh the status on their domain page and
should revoke delegated access after setup. Never put passwords, recovery codes,
API keys or transfer codes in update notes.

## Transactional email

1. In Postmark, verify the sender address or domain and make sure the account
   is approved for external recipients. On the app server (including Vercel
   production), set `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM_EMAIL` (for example
   `SitoMax <support@sitomax.com>`), and `POSTMARK_MESSAGE_STREAM` (defaults to
   `outbound`; use a transactional stream). Remove the old provider's variables.
2. In Supabase **Authentication → Hooks**, generate an HTTP secret for the
   **Send Email Hook**. Set `SUPABASE_SEND_EMAIL_HOOK_SECRET` to the full generated
   value (`v1,whsec_…`) on the app server and deploy it before enabling the hook.
   Set the hook URL to `https://app.sitomax.com/api/auth/send-email` (use your
   actual platform host). The hook handles password recovery and keeps Supabase's
   reset throttling and generic public response. App invitations use Supabase
   to generate the link and send it directly through Postmark. If other Auth
   email flows are enabled in the future, extend the hook before using them.
3. Verify an invite, a password reset, and a form notification with a controlled
   mailbox. Postmark activity uses `invite`, `password-reset`, `domain`, and
   `form-notification` tags. Admin actions show actionable send errors; background
   failures are reported in server logs without bodies, recipient addresses, or
   tokens.

## Lead inbox (Phase A)

Run [`0034_leads_phase_a.sql`](./supabase/migrations/0034_leads_phase_a.sql) in
the Supabase SQL Editor **before deploying** the app. Existing submissions
become New leads and keep their original received date and read state.
Account owners see their own account's sites; the agency can see all sites.
Since `0042_leads_inbox_phase_a.sql` the inbox is shared by everyone with access
to the account, including editors (read state and stars are shared); lead
settings, exports, webhook deliveries and Trash stay owner and agency only.
Inbox stats use UTC and are scoped by the selected website, independent of list filters.
Archiving removes a lead from the active inbox without changing past wins.

With the default Postmark transactional stream configured above, new inquiries
notify account owners after the form is saved. Set `NEXT_PUBLIC_APP_URL` to
the platform origin so **View lead** links open the right lead. Run
[`0040_lead_notification_controls.sql`](./supabase/migrations/0040_lead_notification_controls.sql)
after `0036_postmark_email_events.sql` and before deploying the notification controls. In **Sites → Leads → Notifications**,
owners can replace the default recipients, see the current eligible new-lead
recipients, and send a rate-limited test. Site-wide switches restrict delivery
without overriding personal email preferences. New lead emails include the contact name and form source;
sign-in is required for full answers. Email failure never rolls back a form.
Opt-in digests are best-effort, at most once per site/user per UTC day; they
go to opted-in users' account emails (not the recipient list) and count the
previous UTC day's submissions and current leads awaiting reply. A site-wide
digest switch permits existing opt-ins; turning it on does not subscribe anyone.
Direct email replies bypass tracked forwarding and its notification switch.
Failed new-lead notifications and missing reply recipients are recorded for
super admins; failed/retrying tracked forwards are also flagged on the lead.
Review server logs and notification settings to investigate. Historical failures
remain visible even after settings are corrected.

For webhooks and digests, set the server-only `CRON_SECRET` and generate a
**separate** `LEAD_WORKER_SECRET` (`openssl rand -hex 32`). Compute the
SHA-256 hex digest of that exact secret without a trailing newline and
register **only the hash** in the Supabase SQL Editor:

```sql
insert into public.lead_worker_config (secret_hash)
values ('<64-character SHA-256 hex digest>')
on conflict (singleton) do update set secret_hash = excluded.secret_hash;
```

The Vercel job calls `/api/cron/leads` every five minutes. With another
scheduler, send `Authorization: Bearer <CRON_SECRET>` at the same interval.
Paste a trusted public HTTPS URL (IPv4 DNS required) into **Sites → Leads →
Outgoing webhook**. The destination receives form answers, the site and lead
IDs, and event data. `lead.created` and `lead.status_changed` are active;
`lead.reply_received` will use the same delivery path once replies are built.
Verify `X-SitoMax-Signature` as the hex HMAC-SHA256 of the raw UTF-8 request
body, using the signing secret as shown, not hex-decoded. Deduplicate using
`X-SitoMax-Event-Id`. Non-2xx and network failures retry up to five total
attempts with backoff; redirects are not followed. The latest 50 deliveries
are shown in site settings.

## Replying to leads (Phase B)

Run [`0035_leads_phase_b.sql`](./supabase/migrations/0035_leads_phase_b.sql) in
the Supabase SQL Editor after `0034` and before deploying. Keep the Phase A
worker configured: it reserves sends, stores replies and retries forwards.

1. Use a Postmark **transactional** stream for lead sends/forwards and set
   `POSTMARK_LEADS_STREAM` to its ID. Verify `LEADS_FROM_DOMAIN` in Postmark
   so `leads@LEADS_FROM_DOMAIN` can send. Keep the default transactional
   stream configured for new lead notifications and daily digests.
2. Set up Postmark's inbound stream and custom inbound domain. Publish the
   inbound MX records specified in Postmark, set `INBOUND_REPLY_DOMAIN`
   to that domain, and set `LEAD_REPLY_TOKEN_SECRET` to a separate random
   secret (at least 32 characters). Keep it stable: changing it invalidates
   existing tracked Reply-To addresses.
3. Configure the inbound webhook at `/api/email/inbound` on the exact HTTPS
   origin in `NEXT_PUBLIC_APP_URL`. Configure its HTTP Basic Auth with the
   server-only `POSTMARK_INBOUND_WEBHOOK_USER` and
   `POSTMARK_INBOUND_WEBHOOK_PASSWORD`. Do not put credentials in the
   repository or public configuration.
4. In a controlled mailbox, verify a sent reply, then reply to its tracked
   address from the same address supplied on the lead form. Confirm the
   reply appears in Leads and the right notification recipient gets a
   forwarded copy. Replies from another sending address aren't threaded.

In **Sites → Leads**, tracked delivery is the default. Direct delivery uses
the first notification address alphabetically and does not thread replies
to newly sent emails. The reply composer keeps the sender and reply-to behind
**⋯ → Email details** (open by default for the agency); tracked reply-to
addresses are unique to each lead and are never displayed.
The agency can adjust the per-account daily send limit
(50 by default, midnight UTC reset), and enable optional email footer
branding in **Settings → Branding**. An accepted send counts as a send
attempt even if delivery later fails. Forward delivery is retried up to
three times after the first attempt. Auto-replies are stored collapsed but
not forwarded. Attachments are not stored. Apply
[`0036_postmark_email_events.sql`](./supabase/migrations/0036_postmark_email_events.sql)
after `0035` and before deploying bounce/spam handling. Apply
[`0041_lead_delivery_status.sql`](./supabase/migrations/0041_lead_delivery_status.sql)
before deploying conversation delivery status. In Postmark, configure Delivery
and Bounce webhooks on the lead transactional stream, and Bounce and Spam
Complaint webhooks on streams used for other email, to the exact `NEXT_PUBLIC_APP_URL`
origin at `/api/email/events`, using the same Basic Auth credentials as the
inbound webhook. A delivered status means the recipient's mail server accepted
the message, not that it reached the inbox; older messages without delivery
events remain sent. Open and click tracking are disabled. Suppressed addresses are excluded from lead replies,
notifications, forwards, and daily digests; matching leads show an
undeliverable warning. Any future report sender must also exclude
`public.email_suppressions`.

## Leads inbox

Run [`0044_lead_email_signature.sql`](./supabase/migrations/0044_lead_email_signature.sql)
in the Supabase SQL Editor after `0043`. Until it is applied the inbox works
with the default signature, and **Settings → Email signature** cannot save.

**Leads** (`/dashboard/leads`) is a two-pane inbox on desktop: a resizable lead
list (320–440px) and the open conversation, with an optional Details drawer
(Contact, Notes, Timeline). The list is loaded in the browser 50 leads at a
time and stays in place while conversations open; the view, search and site
filter live in the address. List width, the Details drawer, "Show notes in
thread" and unsent reply drafts are remembered per user in that browser.

On tablets (768–1199px), the list stays 320px wide, workspace navigation
moves into the hamburger drawer, and Details opens as a modal right-hand
overlay. The reply composer stays docked; its pop-out nearly fills the screen.
Touch controls are at least 44px, with a **Select leads** button for bulk mode.

On phones, Leads opens as a full-width list with expandable search, an agency
site filter, and horizontally scrollable view chips. Swipe left to archive
(unarchive in Archived), or right to toggle read/unread; **Undo** is available
for eight seconds after success. Pull down at the top to refresh, or use the
refresh button. Conversations have a back button, a compact actions menu and
**Conversation / Details / Notes** tabs. Reply opens a full-height sheet with
Send at the top and formatting, AI and templates above the keyboard. Its height
follows `visualViewport` and respects safe-area insets. Cancel or Escape keeps
the draft; saved phone drafts stay collapsed until Reply is tapped again.
Owners and super admins can export; editors cannot.

Notification emails link directly to `/dashboard/leads/[leadId]`, without view
filters. Login returns to that conversation, even when the lead is archived,
trashed or outside the current list view; existing account permissions still
apply. Test notifications and digests open the new inbox with a site filter.
Forwarded-reply links also preserve `#reply` through login to open the composer.

The visible inbox refreshes its list and open conversation every 45 seconds,
and when returning to the tab. Polling pauses while offline, while another
refresh is pending, or during a lead/composer action. Loaded rows, scroll
position and unsent drafts are retained. Incoming messages follow the thread
only when already reading at the bottom. Failed optimistic actions immediately
restore the affected fields before reconciling with the server.

With a desktop/tablet keyboard, **j/k** focus the next/previous lead and
**Enter** opens it. **r** replies, **e** archives, **s** toggles the star, **u** marks
unread, **#** moves an authorized lead to Trash, **/** searches and **?** opens
shortcut help. Shortcuts do not intercept typing or menus/dialogs.
**Esc** closes the composer or Details; composer drafts are kept.

Replies are written in a composer docked under the thread (↗ opens it larger).
The signature is part of the reply and can be edited per message; each user
sets a default in **Settings → Email signature**, with the variables `{name}`,
`{business_name}`, `{phone}` and `{website}` filled from the website the lead
belongs to. The newest message of the conversation is appended as quoted
history. **Send**, **Send & mark Won** and **Send & archive** share one button;
Ctrl/Cmd+Enter sends. AI drafts ("Friendly", "Professional", "Brief",
"Improve my draft") use the same credits and rules as before, and email
addresses and phone numbers in a draft being improved are never sent to the
model. When a send fails, the agency also sees the technical cause.

