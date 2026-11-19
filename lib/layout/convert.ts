import { escapeHtml, toRichTextHtml } from "@/lib/richtext";
import { linkHref, parseSiteLink } from "@/lib/links";
import { iconValueSchema } from "@/lib/icons";
import type { BlockDesign } from "@/lib/sections/design";
import {
  ROW_LAYOUTS,
  newComponentId,
  type LayoutItem,
  type RowLayout,
} from "./structure";

/**
 * "Convert to custom layout": turns a designed section into
 * Section → Row → Column → element blocks with the same content, so it
 * can be rearranged freely. The section's design (background, spacing,
 * animation…) moves to the new Section; every element starts from its
 * registered defaults, so the result inherits the theme like any other
 * custom layout. Conversion is a one-way edit (undo restores it).
 */

type Props = Record<string, unknown>;
type Tone = "default" | "soft" | "dark" | "primary";
type Align = "left" | "center";

/** Looks up an element's defaultProps from the Puck config. */
export type DefaultsLookup = (type: string) => Props | undefined;

type Builder = {
  el: (type: string, props?: Props) => LayoutItem;
};

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
/** Keeps typed (picker) links intact; legacy strings stay strings. */
const linkValue = (value: unknown): unknown => parseSiteLink(value) ?? (str(value) || "#");
const iconValue = (value: unknown, fallback: string) => iconValueSchema.safeParse(value).data ?? fallback;
/** Anchor attributes for a link embedded in rich text; page links resolve by id at render time. */
function richTextLinkAttrs(value: unknown): string {
  const link = parseSiteLink(value);
  if (link?.type === "page") return `href="#${link.anchor ?? ""}" data-page-id="${escapeHtml(link.pageId)}"`;
  return `href="${escapeHtml(link ? linkHref(link) : str(value) || "#")}"`;
}
const list = <T = Props>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const html = (value: unknown): string => (str(value) ? toRichTextHtml(str(value)) : "");
const compact = (items: (LayoutItem | null | false | "" | undefined)[]): LayoutItem[] =>
  items.filter((item): item is LayoutItem => Boolean(item));

function column(content: LayoutItem[], props: Props = {}): LayoutItem {
  return {
    type: "Column",
    props: { id: newComponentId("Column"), design: {}, verticalAlign: "top", gap: 16, ...props, content },
  };
}

type ColumnProps = Props | ((index: number) => Props);

function row(
  columns: LayoutItem[][],
  { columnProps }: { columnProps?: ColumnProps } = {},
): LayoutItem {
  return {
    type: "Row",
    props: {
      id: newComponentId("Row"),
      design: {},
      layout: LAYOUT_FOR_COUNT[Math.min(4, Math.max(1, columns.length))],
      gap: 32,
      reverseOnMobile: false,
      columns: columns.map((content, index) =>
        column(content, typeof columnProps === "function" ? columnProps(index) : columnProps),
      ),
    },
  };
}

const LAYOUT_FOR_COUNT: Record<number, RowLayout> = {
  1: "1",
  2: "1-1",
  3: "1-1-1",
  4: "1-1-1-1",
};

/** Rows of up to `perRow` equal columns (rows hold at most 4). */
function grid(cells: LayoutItem[][], perRow = 3, cellProps?: (index: number) => Props): LayoutItem[] {
  const size = Math.min(4, Math.max(1, perRow));
  const rows: LayoutItem[] = [];
  for (let i = 0; i < cells.length; i += size) {
    const chunk = cells.slice(i, i + size);
    const filled = chunk.length;
    // Keep a partial last row on the same column width as the others.
    while (chunk.length < size && cells.length > size) chunk.push([]);
    rows.push(
      row(chunk, {
        columnProps: (index) => (cellProps && index < filled ? cellProps(i + index) : {}),
      }),
    );
  }
  return rows;
}

const CARD: Props = { surface: "card" };

function section(rows: LayoutItem[], design: unknown, background: Tone = "default"): LayoutItem {
  return {
    type: "Section",
    props: {
      id: newComponentId("Section"),
      design: (design && typeof design === "object" ? design : {}) as BlockDesign,
      background,
      width: "contained",
      rowGap: 48,
      rows: rows.filter((r) => list(r.props.columns).length > 0),
    },
  };
}

function withRatio(rowItem: LayoutItem, layout: RowLayout): LayoutItem {
  if (ROW_LAYOUTS[layout].fractions.length !== list(rowItem.props.columns).length) return rowItem;
  return { ...rowItem, props: { ...rowItem.props, layout } };
}

/**
 * Eyebrow / heading / intro text shared by most designed sections. On
 * dark, primary or photo backgrounds the eyebrow inherits the section's
 * light text instead of the (possibly dark) primary color.
 */
function intro(
  b: Builder,
  props: Props,
  align: Align = "left",
  level = "h2",
  onDark = false,
): LayoutItem[] {
  return compact([
    str(props.eyebrow) &&
      b.el("Text", {
        text: `<p><strong>${escapeHtml(str(props.eyebrow))}</strong></p>`,
        size: "sm",
        color: onDark ? "auto" : "primary",
        align,
      }),
    str(props.heading) && b.el("Heading", { text: str(props.heading), level, align }),
    html(props.text) && b.el("Text", { text: html(props.text), align, size: "lg" }),
  ]);
}

function buttons(b: Builder, pairs: [unknown, unknown, string][], align: Align = "left") {
  return compact(
    pairs.map(
      ([label, href, variant]) =>
        str(label) && b.el("Button", { label: str(label), href: linkValue(href), variant, align }),
    ),
  );
}

function imageEl(b: Builder, src: unknown, alt: unknown, props: Props = {}) {
  return str(src) ? b.el("Image", { src: str(src), alt: str(alt), ...props }) : null;
}

function form(b: Builder, props: Props, fieldsKey: string, submitKey = "submitText") {
  const fields = list(props[fieldsKey]);
  return b.el("Form", {
    formName: str(props.formName) || "Contact form",
    ...(fields.length > 0 ? { fields } : null),
    ...(str(props[submitKey]) ? { submitText: str(props[submitKey]) } : null),
    ...(str(props.note) || str(props.formNote)
      ? { note: str(props.note) || str(props.formNote) }
      : null),
  });
}

function photoBackground(design: unknown, image: string): BlockDesign {
  const base = (design && typeof design === "object" ? design : {}) as BlockDesign;
  if (!image || (base.background?.type && base.background.type !== "none")) return base;
  return {
    ...base,
    background: { type: "image", images: [image], overlayColor: "#0f172a", overlayOpacity: 55 },
    textColor: "light",
  };
}

type Converter = (b: Builder, props: Props) => LayoutItem;

const CONVERTERS: Record<string, Converter> = {
  Hero(b, p) {
    const variant = str(p.variant) || (p.layout === "split" ? "split" : "centered");
    const badge = str(p.badgeText);
    const lead = (align: Align, onDark = false) =>
      compact([
        badge ? b.el("Badge", { text: badge, icon: iconValue(p.badgeIcon, "star"), align }) : null,
        ...intro(b, { ...p, text: p.subheading }, align, "h1", onDark),
        ...buttons(
          b,
          [
            [p.buttonText, p.buttonLink, "primary"],
            [p.secondaryButtonText, p.secondaryButtonLink, "secondary"],
          ],
          align,
        ),
      ]);
    if (variant === "centered" || variant === "overlay") {
      const image = str(p.backgroundImage);
      return section(
        [row([lead("center", Boolean(image) || variant === "overlay")])],
        photoBackground(p.design, image),
        variant === "overlay" && !image ? "dark" : "default",
      );
    }
    const side =
      variant === "lead-form"
        ? [form(b, p, "formFields")]
        : compact([imageEl(b, p.backgroundImage, p.backgroundImageAlt, { aspect: "4/3" })]);
    const rows = [row([lead("left"), side], { columnProps: { verticalAlign: "center" } })];
    const stats = list(p.stats).map((s) => [
      b.el("StatNumber", { value: str(s.value), label: str(s.label), size: "3xl" }),
    ]);
    if (variant === "stats" && stats.length > 0) rows.push(...grid(stats, stats.length));
    return section(rows, p.design);
  },

  TextSection(b, p) {
    const variant = str(p.variant);
    const align: Align = p.ctaAlign === "center" || p.align === "center" ? "center" : "left";
    const main = compact([
      ...intro(b, { ...p, text: "" }, align),
      html(p.text) && b.el("Text", { text: html(p.text), align }),
      variant === "pull-quote" && str(p.pullQuote)
        ? b.el("Heading", { text: str(p.pullQuote), level: "h3", font: "heading", color: "primary" })
        : null,
      variant === "mission" && str(p.attribution)
        ? b.el("Text", { text: html(p.attribution), size: "sm", align })
        : null,
      ...(variant === "cta"
        ? buttons(
            b,
            [
              [p.buttonText, p.buttonLink, "primary"],
              [p.secondaryButtonText, p.secondaryButtonLink, "secondary"],
            ],
            align,
          )
        : []),
    ]);
    if (variant === "callout") {
      const callout = compact([
        b.el("Icon", { icon: iconValue(p.calloutIcon, "lightbulb") }),
        str(p.calloutTitle) && b.el("Heading", { text: str(p.calloutTitle), level: "h3", size: "xl" }),
        html(p.calloutText) && b.el("Text", { text: html(p.calloutText) }),
      ]);
      return section([withRatio(row([main, callout]), "2-1")], p.design);
    }
    return section([row([main])], p.design);
  },

  ImageWithText(b, p) {
    const variant = str(p.variant) || (p.imageSide === "right" ? "image-right" : "image-left");
    const text = intro(b, p);
    const image = compact([imageEl(b, p.image, p.imageAlt)]);
    if (variant === "stacked") return section([row([[...image, ...text]])], p.design);
    const cols = variant === "image-right" ? [text, image] : [image, text];
    return section([row(cols, { columnProps: { verticalAlign: "center" } })], p.design);
  },

  Services(b, p) {
    const withImages = p.variant === "image-cards" || p.variant === "image-rows";
    const cards = list(p.services).map((s) =>
      compact([
        withImages ? imageEl(b, s.image, s.imageAlt, { aspect: "3/2" }) : b.el("Icon", { icon: iconValue(s.icon, "star") }),
        b.el("Heading", { text: str(s.title), level: "h3", size: "xl" }),
        html(s.text) && b.el("Text", { text: html(s.text) }),
      ]),
    );
    return section(
      [row([intro(b, p, "center")]), ...grid(cards, 3, withImages ? undefined : () => CARD)],
      p.design,
    );
  },

  Stats(b, p) {
    const cells = list(p.stats).map((s) =>
      compact([
        b.el("StatNumber", { value: str(s.value), label: str(s.label) }),
        str(s.detail) && b.el("Text", { text: html(s.detail), size: "sm" }),
      ]),
    );
    if (p.variant === "split") {
      return section(
        [row([[...intro(b, p), ...cells.flat()], compact([imageEl(b, p.image, p.imageAlt)])])],
        p.design,
      );
    }
    return section(
      [row([intro(b, p, "center")]), ...grid(cells, Math.min(4, cells.length))],
      p.design,
      p.variant === "cards" ? "soft" : "default",
    );
  },

  Gallery(b, p) {
    const cells = list(p.images).map((img) =>
      compact([imageEl(b, img.url, img.alt, { aspect: "4/3" })]),
    );
    return section(
      [row([intro(b, p, "center")]), ...grid(cells, Number(p.columns) || 3)],
      p.design,
    );
  },

  Testimonials(b, p) {
    const cards = list(p.testimonials).map((t) =>
      compact([
        b.el("Icon", { icon: "star", style: "plain", size: "24" }),
        b.el("Text", { text: html(t.quote), size: "lg", color: "text" }),
        b.el("Heading", { text: str(t.name), level: "h4", size: "base" }),
        str(t.role) && b.el("Text", { text: html(t.role), size: "sm" }),
      ]),
    );
    const head = intro(b, p, "center");
    if (p.variant === "rating" && str(p.rating)) {
      head.push(
        b.el("StatNumber", {
          value: str(p.rating),
          label: [str(p.ratingLabel), str(p.reviewCount)].filter(Boolean).join(" · "),
          align: "center",
          animate: false,
        }),
      );
    }
    return section([row([head]), ...grid(cards, 3, () => CARD)], p.design, "soft");
  },

  Logos(b, p) {
    const cells = list(p.logos).map((logo) =>
      compact([imageEl(b, logo.image, logo.name, { aspect: "auto", fit: "contain", width: "75" })]),
    );
    return section([row([intro(b, p, "center")]), ...grid(cells, 4)], p.design);
  },

  Team(b, p) {
    const cards = list(p.members).map((m) =>
      compact([
        imageEl(b, m.image, m.imageAlt, { aspect: "1/1" }),
        b.el("Heading", { text: str(m.name), level: "h3", size: "xl" }),
        str(m.role) && b.el("Text", { text: html(m.role), size: "sm", color: "primary" }),
        html(m.bio) && b.el("Text", { text: html(m.bio) }),
      ]),
    );
    return section([row([intro(b, p, "center")]), ...grid(cards, 3)], p.design);
  },

  Process(b, p) {
    const steps = list(p.steps).map((s, i) =>
      compact([
        b.el("Badge", { text: `Step ${i + 1}`, icon: iconValue(s.icon, "check") }),
        b.el("Heading", { text: str(s.title), level: "h3", size: "xl" }),
        html(s.text) && b.el("Text", { text: html(s.text) }),
      ]),
    );
    return section(
      [row([intro(b, p, "center")]), ...grid(steps, Math.min(4, steps.length) || 3)],
      p.design,
    );
  },

  Pricing(b, p) {
    const plans = list(p.plans);
    const cards = plans.map((plan) =>
      compact([
        plan.highlighted === true
          ? b.el("Badge", { text: str(p.highlightLabel) || "Most popular", showIcon: false, style: "solid" })
          : null,
        b.el("Heading", { text: str(plan.name), level: "h3", size: "xl" }),
        b.el("StatNumber", {
          value: str(plan.price),
          label: str(plan.period),
          size: "4xl",
          animate: false,
        }),
        html(plan.description) && b.el("Text", { text: html(plan.description) }),
        b.el("IconList", {
          items: str(plan.features)
            .split("\n")
            .map((feature) => feature.trim())
            .filter(Boolean)
            .map((text) => ({ icon: "check", text })),
        }),
        ...buttons(b, [
          [plan.buttonText, plan.buttonLink, plan.highlighted === true ? "primary" : "secondary"],
        ]),
      ]),
    );
    const rows = [
      row([intro(b, p, "center")]),
      ...grid(cards, Math.min(4, plans.length) || 3, (index) => ({
        surface: plans[index]?.highlighted === true ? "highlight" : "card",
      })),
    ];
    if (html(p.note)) rows.push(row([[b.el("Text", { text: html(p.note), size: "sm", align: "center" })]]));
    return section(rows, p.design);
  },

  Faq(b, p) {
    const items = list(p.items).flatMap((item) =>
      compact([
        b.el("Heading", { text: str(item.question), level: "h3", size: "lg" }),
        html(item.answer) && b.el("Text", { text: html(item.answer) }),
      ]),
    );
    if (p.variant === "sidebar") {
      const contact = compact([
        imageEl(b, p.contactImage, p.contactImageAlt, { aspect: "4/3" }),
        str(p.contactHeading) && b.el("Heading", { text: str(p.contactHeading), level: "h3", size: "xl" }),
        html(p.contactText) && b.el("Text", { text: html(p.contactText) }),
        ...buttons(b, [[p.contactButtonText, p.contactButtonLink, "primary"]]),
      ]);
      return section([withRatio(row([[...intro(b, p), ...items], contact]), "2-1")], p.design);
    }
    if (p.variant === "two-column") {
      const half = Math.ceil(items.length / 4) * 2;
      return section(
        [row([intro(b, p, "center")]), row([items.slice(0, half), items.slice(half)])],
        p.design,
      );
    }
    return section([row([[...intro(b, p), ...items]])], p.design);
  },

  CallToAction(b, p) {
    const variant = str(p.variant) || "dark";
    const actions = (align: Align) =>
      buttons(
        b,
        [
          [p.buttonText, p.buttonLink, "primary"],
          [p.secondaryButtonText, p.secondaryButtonLink, "secondary"],
        ],
        align,
      );
    if (variant === "split" || variant === "form") {
      const side =
        variant === "form"
          ? [form(b, p, "formFields")]
          : compact([imageEl(b, p.image, p.imageAlt)]);
      return section(
        [row([[...intro(b, p), ...(variant === "form" ? [] : actions("left"))], side], { columnProps: { verticalAlign: "center" } })],
        p.design,
        "soft",
      );
    }
    const design = variant === "image" ? photoBackground(p.design, str(p.image)) : p.design;
    return section(
      [row([[...intro(b, p, "center", "h2", true), ...actions("center")]])],
      design,
      variant === "primary" ? "primary" : "dark",
    );
  },

  ContactForm(b, p) {
    const details = list(p.details);
    const info = compact([
      ...intro(b, p),
      details.length > 0 &&
        b.el("IconList", {
          items: details.map((d) => ({
            icon: iconValue(d.icon, "check"),
            text: [str(d.label), str(d.value)].filter(Boolean).join(": "),
          })),
        }),
      imageEl(b, p.image, p.imageAlt),
    ]);
    const formEl = form(b, p, "formFields");
    if (p.variant === "centered") {
      return section([row([[...intro(b, p, "center"), formEl]])], p.design);
    }
    return section([row([info, [formEl]])], p.design);
  },

  Map(b, p) {
    const map = b.el("MapEmbed", { address: str(p.address), height: "400" });
    if (p.variant === "split") {
      const details = compact([
        ...intro(b, p),
        str(p.address) && b.el("IconList", { items: [{ icon: "map-pin", text: str(p.address) }] }),
      ]);
      return section([withRatio(row([details, [map]]), "1-2")], p.design);
    }
    return section([row([intro(b, p, "center")]), row([[map]])], p.design);
  },

  Footer(b, p) {
    const contact = [
      ["phone", p.phone],
      ["mail", p.email],
      ["map-pin", p.address],
      ["clock", p.hours],
    ]
      .filter(([, value]) => str(value))
      .map(([icon, value]) => ({ icon: icon as string, text: str(value) }));
    const links = list(p.navigation)
      .filter((link) => str(link.label))
      .map(
        (link) =>
          `<p><a ${richTextLinkAttrs(link.href)}>${escapeHtml(str(link.label))}</a></p>`,
      )
      .join("");
    const social = list(p.socialLinks).filter((link) => str(link.url));
    const cols = [
      compact([
        b.el("Heading", { text: str(p.businessName), level: "h3", size: "xl" }),
        str(p.tagline) && b.el("Text", { text: html(p.tagline) }),
        social.length > 0 && b.el("SocialIcons", { links: social, style: "plain" }),
      ]),
      links ? [b.el("Text", { text: links })] : [],
      contact.length > 0 ? [b.el("IconList", { items: contact, size: "sm" })] : [],
    ].filter((col) => col.length > 0);
    return section([row(cols)], p.design, "dark");
  },
};

/** Designed block types that can be converted. */
export const CONVERTIBLE_TYPES = Object.keys(CONVERTERS);

export function canConvertToLayout(type: unknown): boolean {
  return typeof type === "string" && Object.hasOwn(CONVERTERS, type);
}

/** Converts a designed section item, or returns null if unsupported. */
export function convertToLayout(
  item: { type: string; props: Props },
  defaults: DefaultsLookup,
): LayoutItem | null {
  if (!canConvertToLayout(item.type)) return null;
  const b: Builder = {
    el: (type, props = {}) => ({
      type,
      props: {
        // Cloned so converted items never share default arrays/objects.
        ...structuredClone(defaults(type) ?? {}),
        design: {},
        ...props,
        id: newComponentId(type),
      },
    }),
  };
  const converted = CONVERTERS[item.type](b, item.props ?? {});
  if (item.props.photoCredits !== undefined) converted.props.photoCredits = structuredClone(item.props.photoCredits);
  return converted;
}
