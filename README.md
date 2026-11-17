# white-label-multi-tenant-website-platform

## Platform appearance

The dashboard, authentication screens and editor share the warm neutral,
charcoal and restrained violet styles in `app/platform.css`. Shared panels
and controls use the `platform-panel` and `platform-button` classes; editor
chrome also uses Puck's documented theme tokens. Keep platform styling
inside `.platform-ui` or `.platform-editor`. Public tenant pages and the
editor's preview iframe retain each site's own colors, fonts and content.

## Editor AI and business information

Apply migrations through `0013_site_business.sql` in order before using this version.
Owners and editors can maintain a site's business information in its dashboard
settings or the editor's Theme panel. AI site generation saves the supplied
business details alongside its drafts. Editor AI sends that information and
the requested content to the configured AI provider; each attempt is metered.
Review generated content and placeholders before accepting or publishing it.
AI-created sections use image placeholders that can be replaced in the editor.

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

Account owners and the agency can open a site's **Domains** tab. Configure
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

Optional email: set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to a verified
agency sender (for example `Agency <websites@youragency.com>`). Connected domains
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