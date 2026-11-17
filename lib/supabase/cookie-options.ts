/**
 * Auth cookies are host-only. Dashboard sessions stay on the app host and
 * are never shared with tenant or custom-domain hosts.
 */
export function authCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
  };
}
