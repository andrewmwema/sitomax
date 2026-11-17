# Copilot instructions: SitoMax

Read this before every task. It describes what we are building and the rules every change must follow.

## What this product is
A white-label, multi-tenant website platform (similar to Wix or the DashClicks "Sites" app).
- **The agency** (me, the super admin) builds and manages websites for clients.
- **Clients** (sub-accounts) log in to a dashboard branded as the agency and edit their own websites with a drag-and-drop editor.
- Every client site is served from ONE Next.js app. The request's hostname decides which site to render.
- The platform is hosted at `app.ROOT_DOMAIN`; `ROOT_DOMAIN` serves the configured marketing tenant, and client sites use `*.ROOT_DOMAIN` or verified custom domains.
- Clients never see the names of underlying vendors (Supabase, Vercel, Puck). Everything shows the agency brand.

## Stack (do not swap these out)
- **Next.js 16** (App Router, TypeScript, Server Components, Server Actions). In Next 16 the middleware file is `proxy.ts` (formerly `middleware.ts`).
- **Tailwind CSS v4**
- **Supabase**: Postgres, Auth, Storage, Row Level Security. Use `@supabase/ssr` and `@supabase/supabase-js`.
- **Puck** (`@puckeditor/core`): the drag-and-drop visual editor. Page content is stored as Puck JSON.
- **Vercel**: hosting, plus the Vercel REST API for custom domains.
- Package manager: **npm**.

## Folder structure
```
app/
  (marketing)/            marketing site (apex host rewrites to its tenant)
  (auth)/login/           login and magic link
  (dashboard)/dashboard/  logged-in app: sites, forms, analytics, settings
  editor/[pageId]/        full-screen Puck editor
  s/[site]/[[...slug]]/   PUBLIC tenant site renderer (reached only via proxy rewrite)
  api/                    route handlers (public tenant forms/analytics, protected platform APIs)
components/
  blocks/                 Puck block components (Hero, Services, Gallery...)
  dashboard/              dashboard UI
lib/
  supabase/               server.ts, client.ts, admin.ts (service role, server only)
  vercel/domains.ts       Vercel domain API wrapper
  puck/config.tsx         Puck config, registers every block
  tenant.ts               resolve site from hostname
supabase/migrations/      SQL migrations (source of truth for the schema)
templates/                niche template JSON (plumber, salon, restaurant...)
```

## Roles and access
- `profiles.is_super_admin = true` means the agency: full access to every account and site.
- `account_members.role` is `owner` or `editor` for a client account.
  - owner: edit sites, manage domain, view forms and analytics, invite editors
  - editor: edit sites only
- **All access control lives in Postgres RLS.** Never rely only on hiding UI.
- `lib/supabase/admin.ts` (service role key) may be used ONLY in server code, and only for: the public site renderer, the form-submit endpoint, the analytics beacon, super-admin actions, and AI reservations/accounting in `lib/ai/usage.ts` after authenticated account-access checks. Never import it into a client component.

## Multi-tenant routing rules
- `ROOT_DOMAIN` env var (e.g. `sitomax.com`; `localhost:3000` in dev); `NEXT_PUBLIC_APP_URL` is the canonical platform origin.
- Host = `app.ROOT_DOMAIN` → platform dashboard, auth and editor.
- Host = `ROOT_DOMAIN` → marketing tenant from `MARKETING_SITE_SUBDOMAIN`; `www.ROOT_DOMAIN` → 308 to root.
- Host = `{subdomain}.ROOT_DOMAIN` → rewrite to `/s/{subdomain}/{path}`; verified custom domains also rewrite to the tenant renderer.
- Site hosts return 404 for platform routes and private APIs; only form submissions, analytics and `CRON_SECRET`-protected `/api/cron/*` routes are exposed there.
- Any other host → treat it as a custom domain and rewrite to `/s/{host}/{path}`.
- `lib/tenant.ts` resolves `{site}` by checking `sites.subdomain` first, then `sites.custom_domain`.
- In dev, support `{subdomain}.localhost:3000`.

## Content model
- Each page stores `draft_data` (what the editor saves) and `published_data` (what the public sees). Publishing copies draft → published.
- Site-wide theme (colors, fonts, logo) lives in `sites.theme` as JSON and is applied with CSS variables.
- Blocks must read colors and fonts from CSS variables (`var(--color-primary)` etc.), never hard-coded colors, so the theme works everywhere.

## Coding conventions
- TypeScript strict. No `any` unless unavoidable, with a comment.
- Prefer Server Components and Server Actions; use `"use client"` only when needed (editor, interactive UI).
- Validate all user input with `zod`.
- Every new table needs a migration in `supabase/migrations/` with RLS enabled and policies written in the same migration.
- Keep components small. Each Puck block lives in its own file in `components/blocks/`.
- Never commit secrets. Only `.env.example` goes in git.

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
ROOT_DOMAIN=sitomax.com
NEXT_PUBLIC_ROOT_DOMAIN=sitomax.com
NEXT_PUBLIC_APP_URL=https://app.sitomax.com
MARKETING_SITE_SUBDOMAIN=sitomax
NEXT_PUBLIC_AGENCY_NAME=SitoMax
VERCEL_API_TOKEN=                 # server only
VERCEL_PROJECT_ID=
VERCEL_TEAM_ID=                   # optional
```
- Changes to sites.subdomain, sites.custom_domain, sites.domain_verified or sites.account_id must be done in server actions with lib/supabase/admin.ts after checking the user's permission. Regular users can only update sites.name and sites.theme.
