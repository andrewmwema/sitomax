import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { Card } from "./ui/card";
import { BlockIcon } from "./ui/icon";
import { Carousel } from "./ui/carousel";

export type TestimonialsProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  testimonials: { quote: string; name: string; role: string }[];
  variant: "cards" | "quotes" | "carousel" | "rating";
  rating?: string;
  reviewCount?: string;
  ratingLabel?: string;
};

export const Testimonials: ComponentConfig<TestimonialsProps> = {
  label: "Testimonials",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    testimonials: {
      type: "array",
      label: "Testimonials",
      getItemSummary: (item) => item.name || "Testimonial",
      defaultItemProps: { quote: "[Add a real customer quotation here.]", name: "[Customer name]", role: "[Customer location]" },
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
        { label: "Carousel", value: "carousel" },
        { label: "Rating + cards", value: "rating" },
      ],
    },
    rating: { type: "text", label: "Verified rating" },
    reviewCount: { type: "text", label: "Review count" },
    ratingLabel: { type: "text", label: "Rating source / label" },
  },
  defaultProps: {
    design: {},
    eyebrow: "Testimonials",
    heading: "What our customers say",
    testimonials: [
      { quote: "[Clear advice, thoughtful work and a team we felt comfortable welcoming into our home.]", name: "[Alex P.]", role: "[Homeowner]" },
      { quote: "[They listened to what we needed and made the whole project feel straightforward.]", name: "[Sam R.]", role: "[Local business owner]" },
    ],
    variant: "cards",
    rating: "[4.9]/5",
    reviewCount: "[200]+ reviews",
    ratingLabel: "[Review platform]",
  },
  render: ({ eyebrow, heading, testimonials, variant, rating, reviewCount, ratingLabel }) => (
    <Section background="soft">
      <div className="flex flex-col items-center gap-3 text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading level={2}>{heading}</Heading>
      </div>
      {variant === "carousel" ? (
        <div className="mx-auto mt-12 max-w-4xl">
          <Carousel label={typeof heading === "string" ? heading : "Customer testimonials"} items={testimonials.map((t, i) => (
            <Card key={i} className="min-h-80 justify-center gap-8 p-8 sm:p-14">
              <span className="text-sm font-medium uppercase tracking-[0.16em]" style={{ color: "var(--color-muted)" }}>Customer story / {String(i + 1).padStart(2, "0")}</span>
              <blockquote className="max-w-[40ch] text-2xl leading-snug sm:text-4xl" style={{ fontFamily: "var(--font-heading)" }}>{t.quote}</blockquote>
              <p className="text-sm"><strong>{t.name}</strong>{t.role ? ` · ${t.role}` : ""}</p>
            </Card>
          ))} />
        </div>
      ) : (variant ?? "cards") === "quotes" ? (
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
                className="max-w-[35ch] text-3xl sm:text-5xl"
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
        <div className={variant === "rating" ? "mt-12 grid items-start gap-10 lg:grid-cols-[1fr_2fr]" : "mt-12"}>
          {variant === "rating" ? (
            <div className="flex flex-col items-start gap-4 border-t-2 pt-6" style={{ borderColor: "var(--color-secondary)" }}>
              <BlockIcon name="star" size={32} />
              <p className="text-5xl sm:text-6xl" style={{ fontFamily: "var(--font-heading)" }}>{rating}</p>
              <p className="font-semibold">{reviewCount}</p>
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>{ratingLabel}</p>
            </div>
          ) : null}
          <div className={`grid gap-6 ${variant === "rating" ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            {testimonials.map((t, i) => (
              <Card key={i} className="gap-4">
                <figure className="flex h-full flex-col gap-6">
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
                  <figcaption className="mt-auto border-t pt-5 text-sm" style={{ borderColor: "var(--color-border)" }}>
                    <span className="font-semibold">{t.name}</span>
                    {t.role ? (
                      <span style={{ color: "var(--color-muted)" }}> · {t.role}</span>
                    ) : null}
                  </figcaption>
                </figure>
              </Card>
            ))}
          </div>
        </div>
      )}
    </Section>
  ),
};
