import type { ComponentConfig } from "@puckeditor/core";

export type ServicesProps = {
  heading: string;
  services: { icon: string; title: string; text: string }[];
};

export const Services: ComponentConfig<ServicesProps> = {
  label: "Services",
  fields: {
    heading: { type: "text", label: "Heading", contentEditable: true },
    services: {
      type: "array",
      label: "Services",
      getItemSummary: (item) => item.title || "Service",
      defaultItemProps: { icon: "⭐", title: "New service", text: "Describe this service." },
      arrayFields: {
        icon: { type: "text", label: "Icon (emoji)" },
        title: { type: "text", label: "Title" },
        text: { type: "textarea", label: "Text" },
      },
    },
  },
  defaultProps: {
    heading: "Our services",
    services: [
      { icon: "🔧", title: "Service one", text: "Describe this service." },
      { icon: "⚡", title: "Service two", text: "Describe this service." },
      { icon: "✅", title: "Service three", text: "Describe this service." },
    ],
  },
  render: ({ heading, services }) => (
    <section className="w-full" style={{ backgroundColor: "var(--color-background)" }}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 md:py-16">
        <h2
          className="text-center text-3xl font-bold"
          style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
        >
          {heading}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-2xl border p-6 shadow-sm"
              style={{ borderColor: "color-mix(in srgb, var(--color-text) 12%, transparent)" }}
            >
              <span className="text-3xl">{service.icon}</span>
              <h3
                className="text-lg font-semibold"
                style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
              >
                {service.title}
              </h3>
              <p className="text-sm leading-relaxed opacity-80" style={{ color: "var(--color-text)" }}>
                {service.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  ),
};
