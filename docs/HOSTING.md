# SitoMax host layout

Set `ROOT_DOMAIN` and `NEXT_PUBLIC_ROOT_DOMAIN` to the apex domain, and set
`NEXT_PUBLIC_APP_URL` to the platform's absolute app origin.
`MARKETING_SITE_SUBDOMAIN` identifies the site row served at the apex.

| Host | Purpose |
| --- | --- |
| `app.ROOT_DOMAIN` | Platform dashboard, auth and editor |
| `ROOT_DOMAIN` | Marketing tenant site |
| `www.ROOT_DOMAIN` | Permanent redirect to `ROOT_DOMAIN` |
| `{subdomain}.ROOT_DOMAIN` | Client tenant site |
| A verified custom domain | Client tenant site |
| `localhost` | Local platform app |
| `*.app.github.dev`, `*.vercel.app` | Preview/deployment platform app |

The host-routing logic follows this shape while preserving the existing session
refresh, auth guards, tenant redirect lookup and static-asset matcher:

```ts
const ROOT = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
const MARKETING = process.env.MARKETING_SITE_SUBDOMAIN ?? "sitomax";
const PLATFORM_PREFIXES = ["/dashboard", "/login", "/signup", "/auth", "/invite", "/editor", "/forgot-password", "/set-password"];
const PUBLIC_API = ["/api/cron", "/api/forms/submit", "/api/analytics"];

function isAppHost(host: string) {
  return host === `app.${ROOT}` || host.startsWith("localhost") ||
    host.endsWith(".app.github.dev") || host.endsWith(".vercel.app");
}

export async function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const { pathname } = req.nextUrl;

  if (isAppHost(host)) return existingAppLogic(req);

  if (host === `www.${ROOT}`) {
    const url = req.nextUrl.clone(); url.host = ROOT; url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const isPublicApi = PUBLIC_API.some((p) => pathname.startsWith(p));
  if (PLATFORM_PREFIXES.some((p) => pathname.startsWith(p)) ||
      (pathname.startsWith("/api") && !isPublicApi)) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (isPublicApi) return NextResponse.next();

  if (host === ROOT) return NextResponse.rewrite(new URL(`/s/${MARKETING}${pathname}`, req.url));
  if (host.endsWith(`.${ROOT}`)) {
    const sub = host.slice(0, -(ROOT.length + 1));
    return NextResponse.rewrite(new URL(`/s/${sub}${pathname}`, req.url));
  }
  return existingCustomDomainLookup(req);
}
```

Site hosts return 404 for platform pages and private APIs. The form submission
and analytics handlers resolve their tenant from the request host; on the apex
host that resolves to `MARKETING_SITE_SUBDOMAIN`. `/api/cron/*` remains protected
by its bearer `CRON_SECRET`. Tenant pages and per-tenant `robots.txt` and
`sitemap.xml` continue to resolve through the tenant renderer.

Authentication cookies are host-only. Password reset and invite callbacks use
`NEXT_PUBLIC_APP_URL`, and editor previews are rendered under the app host so
they can use the signed-in session without sharing cookies with client sites.

`app`, `www`, `api`, `admin`, `mail`, `email`, `smtp`, `help`, `support`, `docs`,
`blog`, `status`, `dashboard`, `login`, `auth`, `cdn`, `static`, `assets`,
`billing`, `dev`, `staging`, `test`, `ns1` and `ns2` are reserved tenant
subdomains. The super admin can use the configured marketing subdomain.
