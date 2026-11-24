import { hasCenteredIndent } from "./indent-qa";
import { normalizeDesign, type BlockDesign, type DeviceId } from "./design";

/**
 * What the saved settings of a section say about centered text whose box is
 * not centered: a box made narrower than its container on one side only, by
 * unequal left and right margin or padding or by a paragraph indent. The text
 * is then centered around the wrong point, whatever its text alignment says.
 *
 * This reads data only. What a browser actually renders is measured by
 * findOffCenterText in box-alignment.ts.
 */
export type AlignmentProblem = {
  /** The section or nested layout element whose settings cause it. */
  id: string;
  type: string;
  cause: "spacing" | "indent";
  /** The first words of the centered text it moves. */
  text: string;
  devices: DeviceId[];
  /** Margin plus padding on each side, in px, on the first of those devices. */
  left: number;
  right: number;
};

type Item = { type: string; props: Record<string, unknown> };
type Align = "left" | "center" | "right";
type PerDevice<T> = Record<DeviceId, T>;

const DEVICES: readonly DeviceId[] = ["desktop", "tablet", "mobile"];
/** A box shifts by half the difference between its sides; below this it is not visible. */
const MIN_DIFFERENCE = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isItem(value: unknown): value is Item {
  return isRecord(value) && typeof value.type === "string" && isRecord(value.props);
}
function children(item: Item): Item[] {
  return Object.values(item.props).flatMap((value) => Array.isArray(value) ? value.filter(isItem) : []);
}
function designOf(item: Item): BlockDesign | undefined {
  return isRecord(item.props.design) ? item.props.design as BlockDesign : undefined;
}
function align(value: unknown): Align | undefined {
  return value === "left" || value === "center" || value === "right" ? value : undefined;
}
/** A shell's own alignment on each device; tablet and mobile fall back to desktop, as the renderer does. */
function shellAlign(item: Item): PerDevice<Align | undefined> {
  const appearance = designOf(item)?.appearance;
  const desktop = align(appearance?.desktop?.align);
  return { desktop, tablet: align(appearance?.tablet?.align) ?? desktop, mobile: align(appearance?.mobile?.align) ?? desktop };
}
/** Margin plus padding on each side of a shell, cascading desktop → tablet → mobile like its CSS. */
function sides(item: Item): PerDevice<{ left: number; right: number }> {
  const spacing = normalizeDesign(designOf(item)).spacing;
  const desktop = { ...spacing.desktop };
  const tablet = { ...desktop, ...spacing.tablet };
  const mobile = { ...tablet, ...spacing.mobile };
  const of = (box: typeof desktop) => ({
    left: (box.marginLeft ?? 0) + (box.paddingLeft ?? 0),
    right: (box.marginRight ?? 0) + (box.paddingRight ?? 0),
  });
  return { desktop: of(desktop), tablet: of(tablet), mobile: of(mobile) };
}
function words(value: unknown) {
  const text = typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : "";
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export function findAlignmentProblems(section: unknown): AlignmentProblem[] {
  if (!isItem(section)) return [];
  const problems: AlignmentProblem[] = [];
  const report = (item: Item, cause: AlignmentProblem["cause"], text: string, devices: DeviceId[], box = { left: 0, right: 0 }) => {
    if (devices.length) problems.push({ id: String(item.props.id ?? ""), type: item.type, cause, text, devices, ...box });
  };
  /** Reports a shell whose unequal sides move the centered text it holds. */
  const offset = (item: Item, text: string, centered: (device: DeviceId) => boolean) => {
    const box = sides(item);
    const devices = DEVICES.filter((device) => centered(device) && Math.abs(box[device].left - box[device].right) >= MIN_DIFFERENCE);
    report(item, "spacing", text, devices, devices.length ? box[devices[0]] : undefined);
  };
  // A section's own alignment is applied to every heading and paragraph in it.
  const forced = shellAlign(section);

  if (section.type !== "Section") {
    // A designed block: only a chosen section alignment says its text is centered.
    offset(section, words(section.props.heading) || words(section.props.text), (device) => forced[device] === "center");
    if (hasCenteredIndent(section)) report(section, "indent", words(section.props.text) || words(section.props.heading), ["desktop"]);
    return problems;
  }

  /** Devices on which some single-column row holds centered text, with the first such text. */
  const centeredInSection: PerDevice<string> = { desktop: "", tablet: "", mobile: "" };
  for (const row of children(section).filter((item) => item.type === "Row")) {
    const columns = children(row).filter((item) => item.type === "Column");
    const centeredInRow: PerDevice<string> = { desktop: "", tablet: "", mobile: "" };
    for (const column of columns) {
      // An element with no alignment of its own takes its nearest container's.
      const container = { column: shellAlign(column), row: shellAlign(row) };
      const centeredInColumn: PerDevice<string> = { desktop: "", tablet: "", mobile: "" };
      for (const element of children(column)) {
        if (element.type !== "Heading" && element.type !== "Text") continue;
        const text = words(element.props.text);
        if (!text) continue;
        const own = shellAlign(element);
        // Paragraphs can also be centered one by one in the text itself.
        const inline = typeof element.props.text === "string" && /text-align:\s*center/i.test(element.props.text);
        const centered = (device: DeviceId) =>
          (forced[device] ?? own[device] ?? align(element.props.align) ?? container.column[device] ?? container.row[device]) === "center" || (inline && !forced[device]);
        offset(element, text, centered);
        if (element.type === "Text" && hasCenteredIndent(element.props.text, centered("desktop"))) report(element, "indent", text, ["desktop"]);
        for (const device of DEVICES) if (centered(device)) centeredInColumn[device] ||= text;
      }
      // Beside other columns, a column's sides are part of the row's layout, not an offset.
      if (columns.length === 1) {
        offset(column, DEVICES.map((device) => centeredInColumn[device]).find(Boolean) ?? "", (device) => Boolean(centeredInColumn[device]));
        for (const device of DEVICES) centeredInRow[device] ||= centeredInColumn[device];
      }
    }
    offset(row, DEVICES.map((device) => centeredInRow[device]).find(Boolean) ?? "", (device) => Boolean(centeredInRow[device]));
    for (const device of DEVICES) centeredInSection[device] ||= centeredInRow[device];
  }
  offset(section, DEVICES.map((device) => centeredInSection[device]).find(Boolean) ?? "", (device) => Boolean(centeredInSection[device]));
  return problems;
}

/** One problem in words, without ids, for the person editing the site. */
export function alignmentProblemSummary(problem: AlignmentProblem): string {
  return problem.cause === "indent"
    ? "centered text has a large indent that may shift it. Remove the indent if it is not intentional."
    : `centered text is pushed off-center on ${problem.devices.join(", ")}: there is ${problem.left}px of margin and padding on its left and ${problem.right}px on its right.`;
}
