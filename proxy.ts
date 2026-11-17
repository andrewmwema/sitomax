import { NextResponse, type NextRequest } from "next/server";
import { getTenantKeyFromHost } from "@/lib/tenant";
import { updateSession } from "@/lib/supabase/proxy";
import { lookupTenantRedirect } from "@/lib/redirect-lookup";

/**
 * Multi-tenant routing + auth.
 *
 * - Tenant hosts ({subdomain}.ROOT_DOMAIN or a custom domain) are rewritten
 *   to the public renderer at /s/{site}/{path}. API routes (form submit,
 *   analytics beacon) are excluded by the matcher so public sites can call
 *   them un-rewritten.
 * - The agency's own host refreshes the auth session and gates
 *   /dashboard and /editor behind login.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const tenantKey = getTenantKeyFromHost(host);
  const { pathname } = request.nextUrl;

  if (tenantKey) {
    if ((request.method === "GET" || request.method === "HEAD") &&
      !["/robots.txt", "/sitemap.xml"].includes(pathname) && request.nextUrl.searchParams.get("preview") !== "1") {
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

  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip API routes, Next.js internals and static assets.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
    "/robots.txt",
    "/sitemap.xml",
  ],
};
