# SitoMax AI Site Agent — Build Brief

Replace the current scattered AI editing (Ask AI panel, per-section
AI prompts) with ONE agentic AI chat in the editor that can read the
entire site and make coordinated changes across pages, theme, header,
footer, blog and SEO — similar to a coding agent: plan → act with
tools → show changes → user reviews → keep or undo.

Work in 3 phases. After EACH: `npx tsc --noEmit`, lint, tests,
commit "AI agent phase X: …", push, STOP and summarise. Migrations
use the next free number; remind me to run them. Keep the inline
"Rewrite with AI" in the text toolbar (quick, local edits).

=====================================================================
## PHASE A — Agent engine (server)

A1. Agent loop: POST /api/ai/agent (app host; streamed via SSE).
- Model: Sonnet for the agent; Haiku allowed for sub-tasks
  (e.g. alt text). Anthropic tool use loop server-side, prompt
  caching on the system prompt + site map. maxDuration 300.
- Limits per run: max 40 tool calls, max 60 changes, token budget;
  when reached, stop cleanly with a summary and a "Continue" option
  that resumes from the saved run state.
- Every run works on a CHANGESET (sandbox) — never writes to the
  page drafts directly until the user keeps the changes.

A2. Read tools (cheap, on demand):
- get_site_overview: pages (title, nav label, status, section list
  with blockType/designId/short text summary), theme, header,
  footer, business info, blog summary, SEO status. ~compact.
- get_page(pageId): full validated section props for one page.
- search_site(query): find text/sections across pages and posts.
- list_section_designs(blockType?): catalog with short descriptions.
- get_blog_posts(filter) / get_post(id).

A3. Write tools (all validated with zod against existing schemas,
strict: false + one repair retry, sanitizer + contrast auto-fix):
- update_theme (colors, fonts from curated list, radius, buttons)
- update_header / update_footer (layouts + style + menu items)
- update_section_props, update_section_design (SectionShell),
  switch_section_design (map content), insert_section (curated or
  custom layout), move_section, duplicate_section, delete_section
- create_page (name, slug, nav label, sections), update_page_settings
  (title, nav label, SEO title/description, visibility)
- set_image (via Pixabay search → stored in site-assets, alt text)
- create_blog_post_draft / update_blog_post_draft
- ask_user(question, options) — for genuinely ambiguous choices.
Not available to the agent: domains, billing, publishing, business
information (it may PROPOSE business-info changes as a note only),
user/account settings.

A4. Rules in the system prompt: understand the whole request first;
for requests touching > 3 sections or > 1 page, call plan() and
wait for approval; keep the brand consistent; never invent facts,
prices, reviews, stats or contact details — use [placeholders];
WCAG AA; mobile-friendly choices; explain what it changed in plain
English.

A5. Data (migration): ai_agent_threads (site_id, user_id, title,
created_at), ai_agent_messages (thread_id, role, content, tool
calls summary), ai_agent_runs (thread_id, status, usage, cost,
changeset JSON, started/finished), RLS by account membership.
Usage recorded in ai_usage; credits: 1 credit per small run, 3 per
large run (> 10 changes) — show the cost before large runs.
Super admin unlimited.

=====================================================================
## PHASE B — Chat UI + review experience

B1. Right-side "AI" panel (toggle from the top bar and Ctrl/Cmd+J),
resizable. Thread list (new chat, rename, delete) + chat:
- User messages; assistant messages stream in.
- Live step list while working ("Reading Home… Updating theme…
  Adding section to About…") with collapsible details.
- Plan card for big requests: bullet plan + "Approve" / "Change
  plan" / "Cancel".
- ask_user renders as clickable options.
- Stop button mid-run.
- Context chips: "@Home", "@Header", "@This section" (selected
  section is auto-attached when the panel opens from a section).
- Suggested prompts when empty ("Make the site feel more premium",
  "Write a fuller About page", "Use our brand colors", "Improve
  SEO on every page", "Add an FAQ to Pricing").

B2. Review changes (like a code agent diff):
- When a run finishes: "12 changes on 4 pages" card listing each
  change grouped by page/theme/header/footer/blog, each with Keep /
  Undo, plus "Keep all" / "Undo all".
- Preview: the canvas shows the changeset applied, with changed
  sections outlined and a small "AI" badge; clicking a change scrolls
  to it; before/after toggle per section and for theme.
- Keep / Undo choices are review-only in B2; they do not write to
  drafts. Draft application and conflict handling are deferred to B3.

B3. Apply kept changes to drafts as ONE undo step and create a
version-history snapshot ("AI: Made site more premium"). Nothing is
published until the user presses Publish. If the user edits a section
manually while a changeset is pending, warn and rebase or drop that
change.
- Remove the old "Ask AI" panel and the separate "Add a section
  with AI" floating prompt; route those entry points into the agent
  (e.g. "+ Add section → ✨ Ask AI" opens the agent with a prefilled
  request and insert position).

=====================================================================
## PHASE C — Quality, cost and polish

- Before/after quality check on the changeset (contrast, empty text,
  broken links, nav labels, placeholders) — auto-fix or report.
- Thread memory: summarise long threads to keep context small.
- Cost/usage display per run (super admin sees tokens/$; clients
  see credits).
- Rate limits per account; graceful errors with Anthropic error type
  shown to super admins.
- Evals: a scripts/agent-evals.mjs with 10 sample requests run
  against a fixture site, checking the changeset validates and the
  rules hold (no invented facts, AA contrast).
- Tests: tool validation, changeset apply/undo, RLS, credit
  charging, resume after limit.