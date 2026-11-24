import type { ComponentConfig } from "@puckeditor/core";
import { designField, iconField, optionalImageField, richHeadingField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { Card } from "./ui/card";
import { BlockIcon } from "./ui/icon";
import { Carousel } from "./ui/carousel";
import type { IconValue } from "@/lib/icons";

function RatingStars({ rating }: { rating: string }) {
  const score = Math.max(0, Math.min(5, Math.round(Number.parseFloat(rating.replace(/[\[\]]/g, "")) || 0)));
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`${rating} out of 5 stars`}
      style={{ color: "var(--color-secondary)" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= score ? "" : "opacity-25"}>
          <BlockIcon name="star" size={14} />
        </span>
      ))}
    </div>
  );
}

export type TestimonialsProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  testimonials: { quote: string; name: string; role: string; image?: string; imageAlt?: string; rating?: string }[];
  variant: "cards" | "quotes" | "carousel" | "rating" | "trust-bar";
  rating?: string;
  reviewCount?: string;
  ratingLabel?: string;
  trustSignals?: { label: string; value: string; icon: IconValue }[];
};

function ReviewMeta({ review }: { review: TestimonialsProps["testimonials"][number] }) {
  return (
    <div className="flex items-center gap-3">
      {review.image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={review.image} alt={review.imageAlt ?? ""} loading="lazy"
          className="size-11 rounded-full object-cover" />
      ) : null}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm"><strong>{review.name}</strong>{review.role ? ` · ${review.role}` : ""}</p>
        {review.rating ? <RatingStars rating={review.rating} /> : null}
      </div>
    </div>
  );
}

export const Testimonials: ComponentConfig<TestimonialsProps> = {
  label: "Testimonials",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    testimonials: {
      type: "array",
      label: "Testimonials",
      getItemSummary: (item) => item.name || "Testimonial",
      defaultItemProps: { quote: "[Add a real customer quotation here.]", name: "[Customer name]", role: "[Customer location]", image: "", imageAlt: "", rating: "5" },
      arrayFields: {
        quote: { type: "textarea", label: "Quote" },
        name: { type: "text", label: "Name" },
        role: { type: "text", label: "Role / company" },
        image: optionalImageField("Customer photo (optional)", "1/1"),
        imageAlt: { type: "text", label: "Photo alt text" },
        rating: {
          type: "select",
          label: "Rating (optional)",
          options: [5, 4, 3, 2, 1].map((value) => ({ label: `${value} out of 5`, value: String(value) })),
        },
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
        { label: "Trust / rating bar", value: "trust-bar" },
      ],
    },
    rating: { type: "text", label: "Verified rating" },
    reviewCount: { type: "text", label: "Review count" },
    ratingLabel: { type: "text", label: "Rating source / label" },
    trustSignals: {
      type: "array",
      label: "Proof points",
      getItemSummary: (item) => item.label || "Proof point",
      defaultItemProps: { label: "Local and independently reviewed", value: "Trusted nearby", icon: "shield-check" },
      arrayFields: {
        label: { type: "text", label: "Label", contentEditable: true },
        value: { type: "text", label: "Proof point", contentEditable: true },
        icon: iconField("Icon"),
      },
    },
  },
  defaultProps: {
    design: {},
    eyebrow: "Testimonials",
    heading: "What our customers say",
    testimonials: [
      { quote: "[Clear advice, thoughtful work and a team we felt comfortable welcoming into our home.]", name: "[Alex P.]", role: "[Homeowner]", image: "/samples/happy-customer.jpg", imageAlt: "Sample customer portrait", rating: "5" },
      { quote: "[They listened to what we needed and made the whole project feel straightforward.]", name: "[Sam R.]", role: "[Local business owner]", image: "/samples/team-at-work.jpg", imageAlt: "Sample customer at work", rating: "5" },
    ],
    variant: "cards",
    rating: "[4.9]/5",
    reviewCount: "[200]+ reviews",
    ratingLabel: "[Review platform]",
    trustSignals: [
      { label: "Verified reviews", value: "[200]+ real customer stories", icon: "star" },
      { label: "Locally trusted", value: "Serving [Town] and nearby", icon: "map-pin" },
      { label: "Clear next steps", value: "No-obligation first conversation", icon: "message-circle" },
    ],
  },
  render: ({ eyebrow, heading, testimonials, variant, rating, reviewCount, ratingLabel, trustSignals = [] }) => (
    <Section background="soft">
      <div className="section-intro flex flex-col items-center gap-3 text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <RichHeading level={2}>{heading}</RichHeading>
      </div>
      {variant === "trust-bar" ? (
        <div className="mt-[var(--section-gap)] grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.8fr)]">
          <div className="flex flex-col justify-center gap-3 rounded-[var(--radius-lg)] border p-6 sm:p-8"
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}>
            <RatingStars rating={rating ?? "5"} />
            <p className="text-4xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>{rating}</p>
            <p className="text-sm font-medium">{reviewCount}</p>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>{ratingLabel}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {trustSignals.map((signal, i) => (
              <li key={i} className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] border p-5"
                style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}>
                <BlockIcon name={signal.icon} size={22} />
                <span className="font-semibold">{signal.label}</span>
                <span className="text-sm" style={{ color: "var(--color-muted)" }}>{signal.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : variant === "carousel" ? (
        <div className="mx-auto mt-[var(--section-gap)] max-w-4xl">
          <Carousel label={typeof heading === "string" ? heading : "Customer testimonials"} items={testimonials.map((t, i) => (
            <Card key={i} className="min-h-80 justify-center gap-8 p-8 sm:p-14">
              <span className="text-sm font-medium uppercase tracking-[0.16em]" style={{ color: "var(--color-muted)" }}>Customer story / {String(i + 1).padStart(2, "0")}</span>
              <blockquote className="max-w-[40ch] text-2xl leading-snug sm:text-4xl" style={{ fontFamily: "var(--font-heading)" }}>{t.quote}</blockquote>
              <ReviewMeta review={t} />
            </Card>
          ))} />
        </div>
      ) : (variant ?? "cards") === "quotes" ? (
        <div className="mx-auto mt-[var(--section-gap)] flex max-w-[44rem] flex-col gap-[var(--section-gap)]">
          {testimonials.map((t, i) => (
            <figure key={i} className="flex flex-col items-center gap-5 text-center">
              {t.rating ? <RatingStars rating={t.rating} /> : null}
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
                <ReviewMeta review={t} />
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className={variant === "rating" ? "mt-[var(--section-gap)] grid items-start gap-[var(--section-gap)] lg:grid-cols-[1fr_2fr]" : "mt-[var(--section-gap)]"}>
          {variant === "rating" ? (
            <div className="follow-align flex flex-col items-start gap-4 border-t-2 pt-6" style={{ borderColor: "var(--color-secondary)" }}>
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
                  {t.rating ? <RatingStars rating={t.rating} /> : null}
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
                    <ReviewMeta review={t} />
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
