/**
 * Auth cookies are scoped to the root domain INCLUDING subdomains
 * (domain=.ROOT_DOMAIN), so the tenant renderer on {sub}.ROOT_DOMAIN can
 * see the dashboard session and serve draft previews to members.
 * Custom domains can never receive these cookies.
 */
export function authCookieOptions() {
  const root =
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ??
    process.env.ROOT_DOMAIN ??
    "localhost:3000";
  return {
    domain: `.${root.replace(/:\d+$/, "")}`,
    path: "/",
    sameSite: "lax" as const,
  };
}
