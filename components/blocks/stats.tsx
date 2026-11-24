import type { ComponentConfig, RichText } from "@puckeditor/core";
import type { CSSProperties } from "react";
import { designField, iconField, imageField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Card } from "./ui/card";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { IconTile } from "./ui/icon-tile";
import { RichTextContent } from "./ui/rich-text";
import { Section } from "./ui/section";
import type { IconValue } from "@/lib/icons";

export type StatItem = { value: string; label: string; detail: string; icon: IconValue };

export type StatsProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text: RichText;
  stats: StatItem[];
  image: string;
  imageAlt: string;
  variant: "row" | "cards" | "split" | "spotlight" | "band";
};

function StatNumber({ value }: { value: string }) {
  return (
    <dd
      className="mt-[var(--detail-gap)] text-balance leading-none tracking-tight wrap-anywhere tabular-nums"
      style={{
        fontFamily: "var(--font-heading)",
        fontWeight: "var(--heading-weight)" as CSSProperties["fontWeight"],
        fontSize: "clamp(2rem, 4.5vw, 3.75rem)",
      }}
    >
      {value}
    </dd>
  );
}

export const Stats: ComponentConfig<StatsProps> = {
  label: "Stats",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    text: richTextField("Introduction"),
    stats: {
      type: "array",
      label: "Statistics",
      getItemSummary: (item) => `${item.value || ""} ${item.label || "Statistic"}`.trim(),
      defaultItemProps: { value: "[00]+", label: "Your milestone", detail: "Add context for this number.", icon: "award" },
      arrayFields: {
        value: { type: "text", label: "Value", contentEditable: true },
        label: { type: "text", label: "Label", contentEditable: true },
        detail: { type: "text", label: "Supporting detail", contentEditable: true },
        icon: iconField("Icon"),
      },
    },
    image: imageField("Image (split layout)"),
    imageAlt: { type: "text", label: "Image alt text" },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Editorial row", value: "row" },
        { label: "Metric cards", value: "cards" },
        { label: "Photo & numbers", value: "split" },
        { label: "Spotlight metric", value: "spotlight" },
        { label: "Milestone band", value: "band" },
      ],
    },
  },
  defaultProps: {
    design: {},
    eyebrow: "Our business at a glance",
    heading: "Local work. Lasting relationships.",
    text: "<p>Behind every milestone is a customer, a conversation and a job worth doing well.</p>",
    stats: [
      { value: "[20]+", label: "Years in the community", detail: "Helping local homes and businesses.", icon: "home" },
      { value: "[1,500]+", label: "Projects completed", detail: "From everyday repairs to fresh starts.", icon: "wrench" },
      { value: "[4.9]/5", label: "Customer rating", detail: "Based on [200]+ customer reviews.", icon: "star" },
      { value: "[12]", label: "Local specialists", detail: "People who take pride in the details.", icon: "users" },
    ],
    image: "/samples/team-at-work.jpg",
    imageAlt: "Sample of a team planning a project together",
    variant: "row",
  },
  render: ({ eyebrow, heading, text, stats, image, imageAlt, variant = "row", puck }) => {
    const intro = (
      <div className={`section-intro flex min-w-0 flex-col gap-4 ${variant === "cards" ? "mx-auto max-w-[43rem] items-center text-center" : "max-w-[43rem]"}`}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <RichHeading level={2}>{heading}</RichHeading>
        <RichTextContent value={text} className="w-full text-base" />
      </div>
    );

    if (variant === "spotlight") {
      return (
        <Section background="soft">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            {intro}
            <dl className="grid gap-4 sm:grid-cols-2">
              {stats.map((stat, i) => (
                <div key={i} className={`site-card min-w-0 rounded-[var(--radius-lg)] border p-6 ${i === 0 ? "sm:col-span-2" : ""}`}
                  style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
                  <dt className="text-sm font-semibold">{stat.label}</dt>
                  <StatNumber value={stat.value} />
                  {stat.detail ? <dd className="mt-[var(--detail-gap)] text-sm" style={{ color: "var(--color-muted)" }}>{stat.detail}</dd> : null}
                </div>
              ))}
            </dl>
          </div>
        </Section>
      );
    }

    if (variant === "band") {
      return (
        <Section background="dark" style={{ "--eyebrow-color": "var(--color-bg)" } as CSSProperties}>
          {intro}
          <dl className="mt-[var(--section-gap)] grid gap-6 border-y py-8 sm:grid-cols-2 lg:grid-cols-4" style={{ borderColor: "var(--color-border)" }}>
            {stats.map((stat, i) => (
              <div key={i} className="min-w-0">
                <dt className="text-sm font-medium">{stat.label}</dt>
                <StatNumber value={stat.value} />
                {stat.detail ? <dd className="mt-[var(--detail-gap)] text-sm" style={{ color: "var(--color-muted)" }}>{stat.detail}</dd> : null}
              </div>
            ))}
          </dl>
        </Section>
      );
    }

    if (variant === "split") {
      return (
        <Section background="dark" style={{ "--eyebrow-color": "var(--color-bg)" } as CSSProperties}>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="flex min-w-0 flex-col gap-7">
              {intro}
              {image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={image}
                  alt={imageAlt}
                  loading="lazy"
                  className="aspect-[16/9] w-full object-cover"
                  style={{ borderRadius: "var(--radius-lg)" }}
                />
              ) : null}
            </div>
            <dl className="grid min-w-0 gap-x-8 gap-y-7 sm:grid-cols-2">
              {stats.map((stat, i) => (
                <div key={i} className="flex min-w-0 flex-col border-t pt-6" style={{ borderColor: "var(--color-border)" }}>
                  <dt className="text-sm font-medium">{stat.label}</dt>
                  <StatNumber value={stat.value} />
                  {stat.detail ? <dd className="mt-[var(--detail-gap)] max-w-[32ch] text-sm" style={{ color: "var(--color-muted)" }}>{stat.detail}</dd> : null}
                </div>
              ))}
            </dl>
          </div>
        </Section>
      );
    }

    return (
      <Section background={variant === "cards" ? "soft" : "default"}>
        {intro}
        <div className={`mt-[var(--section-gap)] grid gap-6 ${variant === "cards" ? "md:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
          {stats.map((stat, i) => variant === "cards" ? (
            <div key={i} className="min-w-0">
              <Card className="h-full">
                <dl className="flex flex-col gap-3">
                  <dt className="flex flex-col items-start gap-5 text-sm font-semibold">
                    <IconTile name={stat.icon} editPath={puck.isEditing ? `stats.${i}.icon` : undefined} />
                    {stat.label}
                  </dt>
                  <StatNumber value={stat.value} />
                  {stat.detail ? <dd className="max-w-[32ch] text-sm" style={{ color: "var(--color-muted)" }}>{stat.detail}</dd> : null}
                </dl>
              </Card>
            </div>
          ) : (
            <dl key={i} className="min-w-0 border-t pt-6" style={{ borderColor: "var(--color-border)" }}>
              <dt className="text-sm font-semibold">{stat.label}</dt>
              <StatNumber value={stat.value} />
              {stat.detail ? <dd className="mt-[var(--detail-gap)] max-w-[32ch] text-sm" style={{ color: "var(--color-muted)" }}>{stat.detail}</dd> : null}
            </dl>
          ))}
        </div>
      </Section>
    );
  },
};
