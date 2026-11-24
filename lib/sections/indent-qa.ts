import DOMPurify from "isomorphic-dompurify";

export const MAX_NEW_TEXT_INDENT = 64;

export type IndentIssue = { index: number; label: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasLargeCenteredIndent(html: string, centeredByDefault: boolean): boolean {
  if (!/margin-left\s*:/i.test(html)) return false;
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
  for (const element of fragment.querySelectorAll<HTMLElement>("[style]")) {
    const indent = /^(\d+(?:\.\d+)?)px$/i.exec(element.style.marginLeft);
    if (!indent || Number(indent[1]) < MAX_NEW_TEXT_INDENT) continue;
    let node: HTMLElement | null = element;
    let alignment = "";
    while (node && !alignment) {
      alignment = node.style.textAlign;
      node = node.parentElement;
    }
    if (alignment === "center" || (!alignment && centeredByDefault)) return true;
  }
  return false;
}

/** Finds saved rich-text indents; this does not measure rendered overflow. */
export function hasCenteredIndent(value: unknown, centeredByDefault = false): boolean {
  if (typeof value === "string") return hasLargeCenteredIndent(value, centeredByDefault);
  if (Array.isArray(value)) return value.some((entry) => hasCenteredIndent(entry, centeredByDefault));
  if (!isRecord(value)) return false;
  const component = isRecord(value.props) && typeof value.type === "string";
  const props = component ? value.props as Record<string, unknown> : value;
  const appearance = isRecord(props.design) && isRecord(props.design.appearance) ? props.design.appearance : {};
  const deviceCentered = Object.values(appearance).some(
    (device) => isRecord(device) && device.align === "center",
  );
  const isCentered = deviceCentered || (typeof props.align === "string" ? props.align === "center" : component ? false : centeredByDefault);
  return Object.entries(props).some(([key, child]) =>
    key !== "design" && key !== "code" && hasCenteredIndent(child, isCentered));
}

export function findCenteredIndentIssues(data: unknown, labels: Record<string, string | undefined> = {}): IndentIssue[] {
  if (!isRecord(data) || !Array.isArray(data.content)) return [];
  return data.content.flatMap((item: unknown, index: number) => {
    if (!isRecord(item) || typeof item.type !== "string" || !hasCenteredIndent(item)) return [];
    return [{ index, label: labels[item.type] ?? item.type }];
  });
}
