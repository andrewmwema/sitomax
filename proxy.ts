import { NextResponse, type NextRequest } from "next/server";
import { brand } from "@/lib/brand";
import { getRootDomain, getTenantKeyFromHost } from "@/lib/tenant";
import { updateSession } from "@/lib/supabase/proxy";
import { lookupTenantRedirect } from "@/lib/redirect-lookup";
import { hostname, isAppHost } from "@/lib/platform-host";

const PLATFORM_PREFIXES = [
  "/dashboard", "/login", "/signup", "/auth", "/invite", "/editor", "/forgot-password", "/set-password",
];
const PUBLIC_API_PREFIXES = ["/api/forms/submit", "/api/analytics", "/api/cron"];

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

async function serveTenant(request: NextRequest, tenantKey: string) {
  const { pathname } = request.nextUrl;
  if (pathname.endsWith("/rss.xml")) {
    const url = request.nextUrl.clone();
    const blogPath = pathname.slice(0, -"/rss.xml".length) || "/";
    url.pathname = `/s/${tenantKey}/blog-rss.xml`;
    url.searchParams.set("blogPath", blogPath);
    return NextResponse.rewrite(url);
  }
  if ((request.method === "GET" || request.method === "HEAD") &&
    !["/robots.txt", "/sitemap.xml"].includes(pathname) &&
    request.nextUrl.searchParams.get("preview") !== "1") {
    try {
      const destination = await lookupTenantRedirect(tenantKey, pathname);
      if (destination) {
        const target = new URL(destination, request.url);
        if (target.origin !== request.nextUrl.origin) throw new Error("Invalid redirect origin.");
        return NextResponse.redirect(target, 301);
      }
    } catch (error) {
      console.error("Could not resolve tenant redirect", error);
      return new NextResponse("Site temporarily unavailable.", { status: 503 });
    }
  }
  const url = request.nextUrl.clone();
  url.pathname = `/s/${tenantKey}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

/**
 * App hosts serve the platform; root and tenant hosts serve the marketing or
 * client site. Only the form, analytics and protected cron APIs are available
 * on public site hosts.
 */
export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? request.nextUrl.host).toLowerCase();
  const { pathname } = request.nextUrl;
  const root = getRootDomain().toLowerCase();
  const rootHost = hostname(root);

  if ((process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview") &&
    matchesPathPrefix(pathname, "/dev/sections")) {
    return NextResponse.next();
  }

  if (pathname === "/api/email/inbound" || pathname === "/api/email/events") {
    return host === new URL(brand.appUrl).host.toLowerCase() ? NextResponse.next() : new NextResponse("Not found", { status: 404 });
  }
  if (matchesPathPrefix(pathname, "/grader")) {
    if (hostname(host) === `www.${rootHost}`) {
      const url = request.nextUrl.clone();
      url.hostname = rootHost;
      url.port = root.match(/:(\d+)$/)?.[1] ?? "";
      return NextResponse.redirect(url, 308);
    }
    if (hostname(host) === rootHost) return NextResponse.next();
    if (isAppHost(host, rootHost)) return new NextResponse("Not found", { status: 404 });
  }
  if (isAppHost(host, rootHost)) {
    if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return NextResponse.next();
    return updateSession(request);
  }

  if (hostname(host) === `www.${rootHost}`) {
    const url = request.nextUrl.clone();
    url.hostname = rootHost;
    url.port = root.match(/:(\d+)$/)?.[1] ?? "";
    return NextResponse.redirect(url, 308);
  }

  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return NextResponse.next();

  if (PLATFORM_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
  if (pathname.startsWith("/api/") || pathname === "/api") {
    return isPublicApi ? NextResponse.next() : new NextResponse("Not found", { status: 404 });
  }

  const tenantKey = hostname(host) === rootHost
    ? brand.marketingSiteSubdomain
    : getTenantKeyFromHost(host);
  if (!tenantKey) return new NextResponse("Not found", { status: 404 });
  return serveTenant(request, tenantKey);
}

export const config = {
  matcher: [
    // Keep static assets and Next.js internals out of tenant routing.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
    "/robots.txt",
    "/sitemap.xml",
    "/rss.xml",
    "/:path*/rss.xml",
  ],
};
