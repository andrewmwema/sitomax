# SitoMax

Websites that work as hard as you do.

The platform runs at `app.sitomax.com`; the apex domain serves the configured
marketing tenant, and client sites use subdomains or verified custom domains.
See [docs/HOSTING.md](./docs/HOSTING.md) for host routing and environment setup.

Use Node.js 22.x locally and in Vercel. The npm override pins jsdom to 26.1.0
so the server-side rich-text sanitizer can load without requiring the ESM-only
`@exodus/bytes` package.

## Platform appearance

The dashboard, authentication screens and editor share the warm neutral,
charcoal and restrained violet styles in `app/platform.css`. Shared panels
and controls use the `platform-panel` and `platform-button` classes; editor
chrome also uses Puck's documented theme tokens. Keep platform styling
inside `.platform-ui` or `.platform-editor`. Public tenant pages and the
editor's preview iframe retain each site's own colors, fonts and content.

## Internal agency sites

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
AI-created sections use image placeholders that can be replaced in the editor.

To diagnose the provider locally with a configured API key, run
`node scripts/test-anthropic.mjs` for a small message using the site's model.
Add `--generation` to test planning and four page requests with synthetic
details and no database writes (this uses provider credits). Add `--dry-run`
to check the planner and four synthetic page schemas without sending requests.
The planner is strict; page fills are non-strict and get one Zod-driven repair
before the run stops without saving drafts. The diagnostic prints tool metadata,
not prompts, business details or keys.
Provider errors are logged centrally and sanitized details are shown only to
super admins.

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

## Custom domains

Account owners and the agency can click **Connect domain** directly on a site's
dashboard card (**Domains** if a domain is already attached). Alternatively,
click **Pages** on the card, then the **Domains** tab. **Edit** opens the page
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

Optional email: set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to a verified
agency sender (for example `SitoMax <support@sitomax.com>`). Connected domains
notify account owners; delivery failures are logged and retried by later jobs
with a short database claim and provider idempotency key. Existing live domains
are marked notified by the migration to avoid retroactive emails. Without an
API key, live notifications are skipped. The **Send these instructions to my
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
emails current account owners using the existing Resend settings. Failed
completion emails stay pending for the secret-authenticated 15-minute domain
job to retry. Missing email configuration is reported to the admin after saving
the status. Completion status does not bypass DNS verification or set a site's
`domain_verified` flag. Clients can refresh the status on their domain page and
should revoke delegated access after setup. Never put passwords, recovery codes,
API keys or transfer codes in update notes.