# AI Builder Brief — Phase 2: AI Site Building

**Phase order:** Phase 0 `SECTION_LIBRARY_BRIEF.md` → Phase 1 `TEMPLATES_BRIEF.md` → Phase 2 (this brief)
**Branch:** `feature/ai-builder-v1`
**Prerequisites:** Phases 0 and 1 merged. An Anthropic API key and a Pixabay API key are available.
**Related:** see `AI_AGENT_BRIEF.md` for any existing AI decisions, and reconcile with it.

## Context

Phase 0 upgraded the section library. Phase 1 added three master templates (Showcase, Clarity, Studio) under Use SitoMax Designs. Users can preview a template, copy it into an independent site and edit it in the existing editor.

Phase 2 adds AI building with Claude (Anthropic API) in three modes:

1. **Fill a template:** the user picks a template and describes their business, and AI writes the content into it.
2. **Pick and fill:** the user describes their business, and AI recommends the best template, then fills it.
3. **Edit by prompt:** inside the editor, the user types a request and AI changes the selected section or page.

The AI works through the existing template, block and editor systems. It never generates raw HTML/CSS. It outputs structured content that matches the block schema, and the existing renderer displays it.

## Step 1 — Inspect before building

Summarize first:

- The block/section JSON schema and section metadata from Phase 0, and how template content is stored after Phase 1.
- How the copy-template-to-site flow works (reuse it, don't duplicate it).
- Existing auth roles (client, super admin), plans (Starter/Growth/Premium) and Stripe/subscription data.
- Where server-side code lives (API routes, server actions, Supabase edge functions).
- Any existing AI code, including the "Ask AI" button in the section library.

If any block types are missing the field metadata the AI needs, propose the smallest change.

## Step 2 — AI foundation

- Call Claude only from the server. Read the API key from env (`ANTHROPIC_API_KEY`) and set the model in an env var (default `claude-sonnet-5-5`) so it can change without code changes. Never expose the key to the browser.
- Build a machine-readable **block catalog** generated from the existing schema: each block type, its variants, editable fields, field types, character limits, and image slots with aspect ratios. The AI may only output these.
- Use structured output (tool use / JSON schema) for every call. Validate every response against the block schema server-side. On failure, retry once with the validation errors, then fail gracefully with a clear message. Never save invalid content.
- **Content rules** in the system prompt: no lorem ipsum, and no invented facts presented as real (license numbers, awards, years in business, reviews). Insert clearly marked placeholders such as `[Add your license number]`, and highlight unfilled placeholders in the editor. Testimonials are marked as samples until the user replaces them.
- Respect the template's design tokens. The AI may suggest a palette and font pairing only from the Phase 0 theme presets, so contrast and polish stay intact.

## Step 3 — Business intake ("AI building blueprint")

Used by Modes 1 and 2:

- **Required:** business name, what you do, location/service area, main action you want visitors to take (call, book, buy, inquire).
- **Optional:** audiences, services list, tone (professional, friendly, bold, luxury), brand colors, logo upload, existing website URL or text to pull from, phone/email/hours.
- Users can paste a free-text description instead of filling every field. The AI extracts the fields and shows them for confirmation.
- Save intake answers to the site record so later AI edits stay consistent.

## Step 4 — The three modes

### Mode 1: Fill a template

Template preview → "Build with AI" → intake → AI fills every page (home and interior) → user reviews → new independent site opens in the editor.

- Reuse the Phase 1 copy flow first, then apply AI content to the copy. Masters are never touched.
- AI may rename and repurpose interior pages to fit the business (e.g. "Sample Report" becomes "Sample Estimate") and may hide sections that don't fit, using existing blocks only.

### Mode 2: Pick and fill

Intake first → AI returns the top template pick plus a runner-up, each with a one-sentence reason → user confirms or switches → continues as Mode 1.

### Mode 3: Edit by prompt (in the editor)

- A prompt box scoped to the selected section, or the whole page if none is selected.
- Requests to support include "make this headline more premium," "rewrite for homeowners instead of businesses," "add an FAQ section about pricing," "shorten this page" and "translate to Spanish."
- Show a before/after preview with Apply or Discard. Nothing changes until Apply.
- Connect the existing "Ask AI" button in the section library to this mode.

## Step 5 — Images

- No AI image generation in this phase.
- For each image slot, the AI writes search keywords. Fetch matching Pixabay photos, let the user pick from 3–5 options, and copy the chosen image into Supabase storage with source information saved.
- User-uploaded logos and photos always override stock images.
- The AI writes alt text for every image.

## Step 6 — Safety, history and cost controls

- Every AI change creates a version snapshot. Add "Undo AI change" and a version history list so users can restore any earlier version.
- Show a progress state while a full site generates, with a stage-by-stage status if it takes more than a few seconds. Make it resumable if the browser closes.
- **Usage limits by plan**, configurable in one place (full-site builds and prompt edits per month for Starter, Growth and Premium). The super admin is unlimited. Show remaining usage in the UI.
- Log every AI call (user, site, mode, tokens, cost estimate, success or failure) to a Supabase table, and give the super admin a simple usage view.
- Rate-limit per user and handle API errors and timeouts with friendly messages.
- Moderate inputs: politely refuse to build sites for clearly illegal or harmful businesses.

## Step 7 — Acceptance test (verify before reporting done)

As both a client user and the super admin:

1. **Mode 1:** build one site from each of the three templates for three different fictional businesses. Every page is filled, there's no lorem ipsum, placeholders are flagged, and everything is editable in the editor.
2. **Mode 2:** give three different business descriptions and confirm the template picks make sense (e.g. an agency gets Studio).
3. **Mode 3:** run at least five prompt edits, Discard one, Apply the rest, then use Undo to restore an earlier version.
4. Swap an AI-chosen image for another option, then upload your own.
5. Save, reload and reopen. Everything persists. Preview on desktop and mobile.
6. Confirm the master templates are unchanged and two AI-built sites from the same template are independent.
7. Hit a plan usage limit on a test client account and confirm the message is clear.
8. Simulate an invalid AI response and an API timeout, and confirm nothing broken gets saved.

Run lint, type-check and tests, and fix anything broken.

## Step 8 — Report back with

- What was built (files, migrations, env vars needed, new tables).
- The exact env vars to add in Codespaces and Vercel, and where to get each key.
- Known limitations and suggested next steps.
- Step-by-step review instructions for Codespaces: commands, URL/port, test logins, and the click path through every acceptance test.

Commit in logical chunks and open a PR when done.