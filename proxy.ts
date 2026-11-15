import { NextResponse, type NextRequest } from "next/server";
import { getTenantKeyFromHost } from "@/lib/tenant";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Multi-tenant routing + auth.
 *
 * - Tenant hosts ({subdomain}.ROOT_DOMAIN or a custom domain) are rewritten
 *   to the public renderer at /s/{site}/{path}. API routes (form submit,
 *   analytics beacon) stay un-rewritten so public sites can call them.
 * - The agency's own host refreshes the auth session and gates
 *   /dashboard and /editor behind login.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const tenantKey = getTenantKeyFromHost(host);
  const { pathname } = request.nextUrl;

  if (tenantKey) {
    if (pathname.startsWith("/api")) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = `/s/${tenantKey}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
