export function isEmptyPage(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const { content, zones } = data as Record<string, unknown>;
  return (content === undefined || (Array.isArray(content) && content.length === 0)) &&
    (zones === undefined || (zones !== null && typeof zones === "object" && !Array.isArray(zones) &&
      Object.values(zones).every((zone) => Array.isArray(zone) && zone.length === 0)));
}
