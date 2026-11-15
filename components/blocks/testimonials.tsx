import type { ComponentConfig } from "@puckeditor/core";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { Card } from "./ui/card";

export type TestimonialsProps = {
  eyebrow: string;
  heading: string;
  testimonials: { quote: string; name: string; role: string }[];
  variant: "cards" | "quotes";
};

export const Testimonials: ComponentConfig<TestimonialsProps> = {
  label: "Testimonials",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    testimonials: {
      type: "array",
      label: "Testimonials",
      getItemSummary: (item) => item.name || "Testimonial",
      defaultItemProps: { quote: "They did a fantastic job.", name: "Happy customer", role: "" },
      arrayFields: {
        quote: { type: "textarea", label: "Quote" },
        name: { type: "text", label: "Name" },
        role: { type: "text", label: "Role / company" },
      },
    },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Cards", value: "cards" },
        { label: "Large quotes", value: "quotes" },
      ],
    },
  },
  defaultProps: {
    eyebrow: "Testimonials",
    heading: "What our customers say",
    testimonials: [
      { quote: "They did a fantastic job from start to finish.", name: "Alex P.", role: "Homeowner" },
      { quote: "Fast, friendly and professional. Highly recommended.", name: "Sam R.", role: "Local business" },
    ],
    variant: "cards",
  },
  render: ({ eyebrow, heading, testimonials, variant }) => (
    <Section background="soft">
      <div className="flex flex-col items-center gap-3 text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading level={2}>{heading}</Heading>
      </div>
      {(variant ?? "cards") === "quotes" ? (
        <div className="mx-auto mt-12 flex max-w-[44rem] flex-col gap-14">
          {testimonials.map((t, i) => (
            <figure key={i} className="flex flex-col items-center gap-5 text-center">
              <span
                aria-hidden="true"
                className="text-6xl leading-none"
                style={{ color: "var(--color-secondary)", fontFamily: "var(--font-heading)" }}
              >
                &ldquo;
              </span>
              <blockquote
                className="max-w-[40ch] text-xl sm:text-2xl"
                style={{
                  color: "var(--color-text)",
                  fontFamily: "var(--font-heading)",
                  lineHeight: 1.4,
                  letterSpacing: "-0.5px",
                }}
              >
                {t.quote}
              </blockquote>
              <figcaption className="text-sm">
                <span className="font-semibold">{t.name}</span>
                {t.role ? (
                  <span style={{ color: "var(--color-muted)" }}> · {t.role}</span>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {testimonials.map((t, i) => (
            <Card key={i} className="gap-4">
              <span
                aria-hidden="true"
                className="text-5xl leading-none"
                style={{ color: "var(--color-secondary)", fontFamily: "var(--font-heading)" }}
              >
                &ldquo;
              </span>
              <blockquote
                className="max-w-[65ch] text-base"
                style={{ color: "var(--color-text)", lineHeight: 1.6 }}
              >
                {t.quote}
              </blockquote>
              <figcaption className="text-sm">
                <span className="font-semibold">{t.name}</span>
                {t.role ? (
                  <span style={{ color: "var(--color-muted)" }}> · {t.role}</span>
                ) : null}
              </figcaption>
            </Card>
          ))}
        </div>
      )}
    </Section>
  ),
};
