import type { MediaImage } from "@/lib/media";

function contains(value: unknown, url: string): boolean {
  if (value === url) return true;
  return value !== null && typeof value === "object" && Object.values(value).some((item) => contains(item, url));
}

export function cleanPhotoCredits<T extends Record<string, unknown>>(props: T): T {
  if (!Array.isArray(props.photoCredits)) return props;
  const { photoCredits, ...content } = props;
  return { ...props, photoCredits: photoCredits.filter((credit: unknown) =>
    credit !== null && typeof credit === "object" && "url" in credit && typeof credit.url === "string" && contains(content, credit.url)) };
}

export function replaceImage(props: Record<string, unknown>, name: string, image: MediaImage) {
  const path = name.replace(/\[(\d+)\]/g, ".$1").split(".");
  if (!path.length || path.some((key) => !key || ["__proto__", "prototype", "constructor"].includes(key))) throw new Error("Invalid image field path.");
  const next = structuredClone(props);
  let parent: Record<string, unknown> = next;
  for (const key of path.slice(0, -1)) {
    const child = parent[key];
    if (!child || typeof child !== "object") throw new Error("The image field is no longer available.");
    parent = child as Record<string, unknown>;
  }
  const key = path.at(-1)!;
  parent[key] = image.url;
  const altKey = key === "url" || key === "src" ? "alt" : `${key}Alt`;
  parent[altKey] = image.alt;
  return cleanPhotoCredits(next);
}
