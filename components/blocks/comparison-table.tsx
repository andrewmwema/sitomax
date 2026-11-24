import type { ComponentConfig, RichText } from "@puckeditor/core";
import type { BlockDesign } from "@/lib/sections/design";
import type { LinkValue } from "@/lib/links";
import { designField, linkField, richTextField, richHeadingField } from "@/lib/puck/fields";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { RichTextContent } from "./ui/rich-text";
import { Button } from "./ui/button";

export type ComparisonTableProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text: RichText;
  ourLabel: string;
  typicalLabel: string;
  rows: { topic: string; ours: string; typical: string }[];
  buttonText: string;
  buttonLink: LinkValue;
  variant: "table" | "cards";
};

export const ComparisonTable: ComponentConfig<ComparisonTableProps> = {
  label: "Comparison table",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    text: richTextField("Introduction"),
    ourLabel: { type: "text", label: "Your approach label", contentEditable: true },
    typicalLabel: { type: "text", label: "Alternative label", contentEditable: true },
    rows: {
      type: "array",
      label: "Comparison points",
      getItemSummary: (item) => item.topic || "Comparison point",
      defaultItemProps: { topic: "Clear scope", ours: "A written plan before work begins", typical: "Details confirmed as the work progresses" },
      arrayFields: {
        topic: { type: "text", label: "Topic", contentEditable: true },
        ours: { type: "text", label: "Your approach", contentEditable: true },
        typical: { type: "text", label: "Alternative approach", contentEditable: true },
      },
    },
    buttonText: { type: "text", label: "Button text", contentEditable: true },
    buttonLink: linkField("Button link"),
    variant: {
      type: "radio",
      label: "Layout",
      options: [{ label: "Comparison table", value: "table" }, { label: "Stacked comparison cards", value: "cards" }],
    },
  },
  defaultProps: {
    design: {},
    eyebrow: "A more considered choice",
    heading: "Know what to expect before you begin",
    text: "<p>Compare the details that shape a good working relationship, then decide what feels right for your project.</p>",
    ourLabel: "Our approach",
    typicalLabel: "A typical experience",
    rows: [
      { topic: "Scope", ours: "Agreed in writing before work starts", typical: "May be clarified as work progresses" },
      { topic: "Communication", ours: "A clear point of contact throughout", typical: "Updates depend on the project" },
      { topic: "Next steps", ours: "Options and timing explained upfront", typical: "Details vary by provider" },
    ],
    buttonText: "Talk through your project",
    buttonLink: "/contact",
    variant: "table",
  },
  render: ({ eyebrow, heading, text, ourLabel, typicalLabel, rows, buttonText, buttonLink, variant }) => (
    <Section background="soft">
      <div className="section-intro mx-auto flex max-w-[43rem] flex-col items-center gap-4 text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <RichHeading level={2}>{heading}</RichHeading>
        <RichTextContent value={text} className="w-full text-base" />
      </div>
      <div className="mt-[var(--section-gap)]">
        {variant === "table" ? (
          <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border md:block" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{ourLabel} compared with {typicalLabel}</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-1/4 p-5" style={{ color: "var(--color-muted)" }}>What matters</th>
                  <th scope="col" className="w-[38%] p-5 font-semibold" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>{ourLabel}</th>
                  <th scope="col" className="p-5 font-semibold">{typicalLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                    <th scope="row" className="p-5 font-semibold">{row.topic}</th>
                    <td className="p-5" style={{ background: "color-mix(in srgb, var(--color-primary) 6%, var(--color-bg))" }}>{row.ours}</td>
                    <td className="p-5" style={{ color: "var(--color-muted)" }}>{row.typical}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className={`grid gap-4 ${variant === "cards" ? "md:grid-cols-2" : "md:hidden"}`}>
          {rows.map((row, i) => (
            <article key={i} className="rounded-[var(--radius-lg)] border p-5" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
              <h3 className="mb-4 font-semibold">{row.topic}</h3>
              <dl className="grid gap-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>{ourLabel}</dt>
                  <dd className="mt-1 text-sm">{row.ours}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>{typicalLabel}</dt>
                  <dd className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>{row.typical}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>
      {buttonText ? <div className="mt-8 flex justify-center"><Button href={buttonLink}>{buttonText}</Button></div> : null}
    </Section>
  ),
};
