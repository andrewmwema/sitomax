import type { ComponentConfig, RichText } from "@puckeditor/core";
import type { CSSProperties } from "react";
import { designField, linkField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { LinkValue } from "@/lib/links";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading, RichHeading } from "./ui/heading";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { BlockIcon } from "./ui/icon";
import { RichTextContent } from "./ui/rich-text";
import { BillingToggle } from "./ui/billing-toggle";

export type PricingPlan = {
  name: string;
  description?: RichText;
  price: string;
  period: string;
  yearlyPrice?: string;
  yearlyPeriod?: string;
  features: string;
  buttonText: string;
  buttonLink: LinkValue;
  reassurance?: string;
  highlighted: boolean;
};

export type PricingProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text?: RichText;
  note?: RichText;
  highlightLabel?: string;
  plans: PricingPlan[];
  variant: "cards" | "simple" | "billing" | "comparison" | "single";
};

function featuresFor(plan: PricingPlan): string[] {
  return plan.features.split("\n").map((feature) => feature.trim()).filter(Boolean);
}

function PlanPrice({ plan, yearly = false }: { plan: PricingPlan; yearly?: boolean }) {
  const hasYearlyPrice = Boolean(plan.yearlyPrice?.trim());
  return (
    <p aria-live="polite" className="flex flex-col gap-2">
      <span
        className="leading-tight tracking-tight wrap-anywhere"
        style={{
          fontSize: "clamp(2rem, 3.2vw, 2.75rem)",
          fontFamily: "var(--font-heading)",
          fontWeight: "var(--heading-weight)" as CSSProperties["fontWeight"],
        }}
      >
        {yearly ? (hasYearlyPrice ? plan.yearlyPrice : "On request") : plan.price}
      </span>
      <span className="text-sm" style={{ color: "var(--color-muted)" }}>
        {yearly ? (hasYearlyPrice ? plan.yearlyPeriod || "per year" : "Ask about yearly pricing") : plan.period}
      </span>
    </p>
  );
}

function PlanFeatures({ features }: { features: string[] }) {
  return (
    <ul className="flex flex-1 flex-col gap-3 text-sm">
      {features.map((feature, index) => (
        <li key={index} className="flex items-start gap-3">
          <span className="shrink-0 self-start" style={{ color: "var(--color-primary)" }}>
            <BlockIcon name="check" size={18} />
          </span>
          <span style={{ color: "var(--color-muted)" }}>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanAction({ plan }: { plan: PricingPlan }) {
  return (
    <div className="flex flex-col gap-2">
      {plan.buttonText ? (
        <Button href={plan.buttonLink} variant={plan.highlighted ? "primary" : "secondary"} className="w-full">
          {plan.buttonText}
        </Button>
      ) : null}
      {plan.reassurance ? (
        <p className="text-center text-xs leading-5" style={{ color: "var(--color-muted)" }}>{plan.reassurance}</p>
      ) : null}
    </div>
  );
}

function PlanBody({ plan, yearly, highlightLabel }: { plan: PricingPlan; yearly: boolean; highlightLabel: string }) {
  return (
    <>
      <div className="follow-align flex min-w-0 flex-col items-start gap-3">
        <div className="min-h-7">{plan.highlighted && highlightLabel ? <Badge>{highlightLabel}</Badge> : null}</div>
        <Heading level={3}>{plan.name}</Heading>
        <RichTextContent value={plan.description} className="w-full text-sm" />
      </div>
      <PlanPrice plan={plan} yearly={yearly} />
      <div className="border-t" style={{ borderColor: "var(--color-border)" }} />
      <PlanFeatures features={featuresFor(plan)} />
      <PlanAction plan={plan} />
    </>
  );
}

function Comparison({ plans, highlightLabel }: { plans: PricingPlan[]; highlightLabel: string }) {
  const features = [...new Set(plans.flatMap(featuresFor))];
  return (
    <>
      <div className="grid gap-5 md:hidden">
        {plans.map((plan, index) => (
          <Card key={index} className="min-w-0 gap-5" style={plan.highlighted ? { borderColor: "var(--color-primary)", borderWidth: 2 } : undefined}>
            {plan.highlighted && highlightLabel ? <div><Badge>{highlightLabel}</Badge></div> : null}
            <Heading level={3}>{plan.name}</Heading>
            <RichTextContent value={plan.description} className="w-full text-sm" />
            <PlanPrice plan={plan} />
            <ul className="flex flex-col gap-3 text-sm">
              {features.map((feature) => {
                const included = featuresFor(plan).includes(feature);
                return (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="shrink-0 self-start" style={{ color: "var(--color-primary)" }}>
                      {included ? <BlockIcon name="check" size={18} /> : <span aria-hidden="true">&mdash;</span>}
                      <span className="sr-only">{included ? "Included: " : "Not included: "}</span>
                    </span>
                    <span style={{ color: "var(--color-muted)" }}>{feature}</span>
                  </li>
                );
              })}
            </ul>
            <PlanAction plan={plan} />
          </Card>
        ))}
      </div>
      <div
        className="hidden overflow-hidden border md:block"
        style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-bg)" }}
      >
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">Plan pricing and included services</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[28%] px-5 py-7 align-bottom font-medium" style={{ color: "var(--color-muted)" }}>
                What is included
              </th>
              {plans.map((plan, index) => (
                <th
                  key={index}
                  scope="col"
                  className="px-4 py-7 align-top font-normal lg:px-6"
                  style={{ backgroundColor: plan.highlighted ? "var(--color-soft-bg)" : undefined }}
                >
                  <div className="flex min-w-0 flex-col items-start gap-4">
                    <div className="min-h-7">{plan.highlighted && highlightLabel ? <Badge>{highlightLabel}</Badge> : null}</div>
                    <Heading level={3}>{plan.name}</Heading>
                    <PlanPrice plan={plan} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature) => (
              <tr key={feature} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <th scope="row" className="px-5 py-4 font-medium">{feature}</th>
                {plans.map((plan, index) => {
                  const included = featuresFor(plan).includes(feature);
                  return (
                    <td key={index} className="px-4 py-4 lg:px-6" style={{ backgroundColor: plan.highlighted ? "var(--color-soft-bg)" : undefined, color: "var(--color-primary)" }}>
                      {included ? <BlockIcon name="check" size={20} /> : <span aria-hidden="true">&mdash;</span>}
                      <span className="sr-only">{included ? "Included" : "Not included"}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t" style={{ borderColor: "var(--color-border)" }}>
              <td className="px-5 py-6" />
              {plans.map((plan, index) => (
                <td key={index} className="px-4 py-6 align-bottom lg:px-6" style={{ backgroundColor: plan.highlighted ? "var(--color-soft-bg)" : undefined }}>
                  <PlanAction plan={plan} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

export const Pricing: ComponentConfig<PricingProps> = {
  label: "Pricing",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    text: richTextField("Introduction"),
    note: richTextField("Pricing note"),
    highlightLabel: { type: "text", label: "Highlighted plan badge", contentEditable: true },
    plans: {
      type: "array",
      label: "Plans",
      getItemSummary: (item) => item.name || "Plan",
      defaultItemProps: {
        name: "New plan",
        description: "<p>A short introduction to this option.</p>",
        price: "$[49]",
        period: "per month",
        yearlyPrice: "$[490]",
        yearlyPeriod: "per year",
        features: "Project guidance\nAgreed scope of work\nWritten estimate",
        buttonText: "Ask about this plan",
        buttonLink: "/contact",
        reassurance: "",
        highlighted: false,
      },
      arrayFields: {
        name: { type: "text", label: "Name", contentEditable: true },
        description: richTextField("Description"),
        price: { type: "text", label: "Price", contentEditable: true },
        period: { type: "text", label: "Period", placeholder: "per month" },
        yearlyPrice: { type: "text", label: "Yearly price (billing toggle)" },
        yearlyPeriod: { type: "text", label: "Yearly period", placeholder: "per year" },
        features: { type: "textarea", label: "Features (one per line; identical names share a comparison row)" },
        buttonText: { type: "text", label: "Button text", contentEditable: true },
        buttonLink: linkField("Button link"),
        reassurance: { type: "text", label: "Reassurance under button", contentEditable: true },
        highlighted: {
          type: "radio",
          label: "Highlighted (also selects the single plan)",
          options: [{ label: "Yes", value: true }, { label: "No", value: false }],
        },
      },
    },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Cards", value: "cards" },
        { label: "Monthly / yearly", value: "billing" },
        { label: "Comparison table", value: "comparison" },
        { label: "Single plan with checklist", value: "single" },
        { label: "Simple columns (legacy)", value: "simple" },
      ],
    },
  },
  defaultProps: {
    design: {},
    eyebrow: "Pricing",
    heading: "Simple, honest pricing",
    text: "",
    note: "",
    highlightLabel: "Featured plan",
    plans: [
      { name: "Essential", price: "$[49]", period: "per month", features: "Project guidance\nWritten estimate", buttonText: "Choose plan", buttonLink: "/contact", reassurance: "", highlighted: false },
      { name: "Complete", price: "$[99]", period: "per month", features: "Project guidance\nWritten estimate\nOngoing care", buttonText: "Choose plan", buttonLink: "/contact", reassurance: "", highlighted: true },
    ],
    variant: "cards",
  },
  render: ({ eyebrow, heading, text, note, plans, highlightLabel = "Featured plan", variant = "cards" }) => {
    const intro = (
      <div className={`section-intro flex min-w-0 flex-col gap-4 ${variant === "single" ? "" : "mx-auto max-w-[43rem] items-center text-center"}`}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <RichHeading level={2}>{heading}</RichHeading>
        <RichTextContent value={text} className="w-full text-base" />
      </div>
    );
    const cards = (yearly = false) => (
      <div className="grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan, index) => variant === "simple" ? (
          <div key={index} className="flex min-w-0 flex-col gap-5 border-t-[3px] pt-6" style={{ borderColor: plan.highlighted ? "var(--color-primary)" : "var(--color-border)" }}>
            <PlanBody plan={plan} yearly={yearly} highlightLabel={highlightLabel} />
          </div>
        ) : (
          <Card key={index} className="min-w-0 gap-5" style={{
            backgroundColor: variant === "billing" ? "var(--color-soft-bg)" : "var(--color-bg)",
            ...(plan.highlighted ? { borderColor: "var(--color-primary)", borderWidth: 2 } : {}),
          }}>
            <PlanBody plan={plan} yearly={yearly} highlightLabel={highlightLabel} />
          </Card>
        ))}
      </div>
    );
    const single = plans.find((plan) => plan.highlighted) ?? plans[0];

    return (
      <Section background={variant === "cards" || variant === "single" ? "soft" : "default"}>
        {variant === "single" ? (
          <div className="grid items-center gap-9 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            {intro}
            {single ? (
              <Card className="min-w-0 gap-6" style={{ borderColor: "var(--color-primary)" }}>
                <PlanBody plan={single} yearly={false} highlightLabel={highlightLabel} />
              </Card>
            ) : null}
          </div>
        ) : (
          <>
            {intro}
            <div className="mt-[var(--section-gap)]">
              {variant === "billing" ? <BillingToggle monthly={cards()} yearly={cards(true)} /> :
                variant === "comparison" ? <Comparison plans={plans} highlightLabel={highlightLabel} /> : cards()}
            </div>
          </>
        )}
        {note ? <RichTextContent value={note} className="mx-auto mt-[var(--content-gap)] w-full text-center text-xs" /> : null}
      </Section>
    );
  },
};
