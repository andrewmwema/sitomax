# white-label-multi-tenant-website-platform

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