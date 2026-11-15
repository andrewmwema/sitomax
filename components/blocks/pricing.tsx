import type { ComponentConfig } from "@puckeditor/core";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { BlockIcon } from "./ui/icon";

export type PricingProps = {
  eyebrow: string;
  heading: string;
  plans: {
    name: string;
    price: string;
    period: string;
    features: string;
    buttonText: string;
    buttonLink: string;
    highlighted: boolean;
  }[];
};

export const Pricing: ComponentConfig<PricingProps> = {
  label: "Pricing",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    plans: {
      type: "array",
      label: "Plans",
      getItemSummary: (item) => item.name || "Plan",
      defaultItemProps: {
        name: "New plan",
        price: "$49",
        period: "per month",
        features: "Feature one\nFeature two\nFeature three",
        buttonText: "Choose plan",
        buttonLink: "/contact",
        highlighted: false,
      },
      arrayFields: {
        name: { type: "text", label: "Name" },
        price: { type: "text", label: "Price" },
        period: { type: "text", label: "Period", placeholder: "per month" },
        features: { type: "textarea", label: "Features (one per line)" },
        buttonText: { type: "text", label: "Button text", contentEditable: true },
        buttonLink: { type: "text", label: "Button link" },
        highlighted: {
          type: "radio",
          label: "Highlighted",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false },
          ],
        },
      },
    },
  },
  defaultProps: {
    eyebrow: "Pricing",
    heading: "Simple, honest pricing",
    plans: [
      {
        name: "Basic",
        price: "$49",
        period: "per month",
        features: "Feature one\nFeature two",
        buttonText: "Choose plan",
        buttonLink: "/contact",
        highlighted: false,
      },
      {
        name: "Pro",
        price: "$99",
        period: "per month",
        features: "Everything in Basic\nFeature three\nFeature four",
        buttonText: "Choose plan",
        buttonLink: "/contact",
        highlighted: true,
      },
    ],
  },
  render: ({ eyebrow, heading, plans }) => (
    <Section>
      <div className="flex flex-col items-center gap-3 text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading level={2}>{heading}</Heading>
      </div>
      <div className="mt-12 grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan, i) => (
          <Card
            key={i}
            className="gap-5"
            style={
              plan.highlighted
                ? { borderColor: "var(--color-primary)", borderWidth: 2 }
                : undefined
            }
          >
            <div className="flex items-start justify-between gap-3">
              <Heading level={3}>{plan.name}</Heading>
              {plan.highlighted ? <Badge>Most popular</Badge> : null}
            </div>
            <p>
              <span
                className="text-4xl"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: "var(--heading-weight)" as React.CSSProperties["fontWeight"],
                  letterSpacing: "-1px",
                }}
              >
                {plan.price}
              </span>{" "}
              <span className="text-sm" style={{ color: "var(--color-muted)" }}>
                {plan.period}
              </span>
            </p>
            <ul className="flex flex-1 flex-col gap-2.5 text-sm" style={{ lineHeight: 1.6 }}>
              {plan.features
                .split("\n")
                .filter(Boolean)
                .map((feature, j) => (
                  <li key={j} className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0" style={{ color: "var(--color-primary)" }}>
                      <BlockIcon name="check" size={16} />
                    </span>
                    <span style={{ color: "var(--color-muted)" }}>{feature}</span>
                  </li>
                ))}
            </ul>
            {plan.buttonText ? (
              <Button
                href={plan.buttonLink}
                variant={plan.highlighted ? "primary" : "secondary"}
                className="w-full"
              >
                {plan.buttonText}
              </Button>
            ) : null}
          </Card>
        ))}
      </div>
    </Section>
  ),
};
