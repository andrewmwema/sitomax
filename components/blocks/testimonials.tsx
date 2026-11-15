import type { ComponentConfig } from "@puckeditor/core";

export type TestimonialsProps = {
  heading: string;
  testimonials: { quote: string; name: string; role: string }[];
};

export const Testimonials: ComponentConfig<TestimonialsProps> = {
  label: "Testimonials",
  fields: {
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
  },
  defaultProps: {
    heading: "What our customers say",
    testimonials: [
      { quote: "They did a fantastic job from start to finish.", name: "Alex P.", role: "Homeowner" },
      { quote: "Fast, friendly and professional. Highly recommended.", name: "Sam R.", role: "Local business" },
    ],
  },
  render: ({ heading, testimonials }) => (
    <section
      className="w-full"
      style={{
        background: "color-mix(in srgb, var(--color-primary) 6%, var(--color-background))",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 md:py-16">
        <h2
          className="text-center text-3xl font-bold"
          style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
        >
          {heading}
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {testimonials.map((t, i) => (
            <figure
              key={i}
              className="flex flex-col gap-4 rounded-2xl p-6 shadow-sm"
              style={{ backgroundColor: "var(--color-background)" }}
            >
              <blockquote
                className="text-base leading-relaxed italic opacity-90"
                style={{ color: "var(--color-text)" }}
              >
                “{t.quote}”
              </blockquote>
              <figcaption className="text-sm" style={{ color: "var(--color-text)" }}>
                <span className="font-semibold">{t.name}</span>
                {t.role ? <span className="opacity-70"> · {t.role}</span> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  ),
};
