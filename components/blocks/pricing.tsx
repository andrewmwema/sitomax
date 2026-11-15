import type { ComponentConfig } from "@puckeditor/core";

export type PricingProps = {
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
        buttonText: { type: "text", label: "Button text" },
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
    heading: "Pricing",
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
  render: ({ heading, plans }) => (
    <section className="w-full" style={{ backgroundColor: "var(--color-background)" }}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 md:py-16">
        <h2
          className="text-center text-3xl font-bold"
          style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
        >
          {heading}
        </h2>
        <div className="grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`flex flex-col gap-5 rounded-2xl border p-6 ${
                plan.highlighted ? "shadow-lg" : "shadow-sm"
              }`}
              style={{
                borderColor: plan.highlighted
                  ? "var(--color-primary)"
                  : "color-mix(in srgb, var(--color-text) 12%, transparent)",
              }}
            >
              <div>
                <h3
                  className="text-lg font-semibold"
                  style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
                >
                  {plan.name}
                </h3>
                <p className="mt-2" style={{ color: "var(--color-text)" }}>
                  <span className="text-4xl font-bold">{plan.price}</span>{" "}
                  <span className="text-sm opacity-70">{plan.period}</span>
                </p>
              </div>
              <ul className="flex flex-1 flex-col gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                {plan.features
                  .split("\n")
                  .filter(Boolean)
                  .map((feature, j) => (
                    <li key={j} className="flex items-start gap-2 opacity-85">
                      <span style={{ color: "var(--color-primary)" }}>✓</span>
                      {feature}
                    </li>
                  ))}
              </ul>
              {plan.buttonText ? (
                <a
                  href={plan.buttonLink || "#"}
                  className={`rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition hover:opacity-90 ${
                    plan.highlighted ? "text-white" : ""
                  }`}
                  style={
                    plan.highlighted
                      ? { backgroundColor: "var(--color-primary)" }
                      : {
                          border: "1px solid var(--color-primary)",
                          color: "var(--color-primary)",
                        }
                  }
                >
                  {plan.buttonText}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  ),
};
