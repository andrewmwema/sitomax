// A forwarding proxy may hide the public host. Browsers cannot forge this
// fetch-metadata header; fall back to Origin for clients without it.
export function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";
  return request.headers.get("origin") === new URL(request.url).origin;
}
