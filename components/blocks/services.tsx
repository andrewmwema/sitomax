import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, iconField, imageField, richTextField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { Card } from "./ui/card";
import { IconTile } from "./ui/icon-tile";
import { RichTextContent } from "./ui/rich-text";
import { Tabs } from "./ui/tabs";
import type { IconValue } from "@/lib/icons";

export type ServiceItem = {
  icon: IconValue;
  title: string;
  text: RichText;
  image: string;
  imageAlt: string;
};

export type ServicesProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text?: RichText;
  services: ServiceItem[];
  variant: "grid" | "bordered" | "image-cards" | "image-rows" | "list" | "tabs" | "tabs-vertical" | "tabs-simple";
};

function ServiceImage({ service, className = "" }: { service: ServiceItem; className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={service.image || "/samples/home-interior.jpg"}
      alt={service.image ? (service.imageAlt ?? "") : "Sample of a welcoming home interior"}
      loading="lazy"
      className={`aspect-[4/3] w-full object-cover ${className}`}
      style={{ borderRadius: "var(--radius-lg)" }}
    />
  );
}

export const Services: ComponentConfig<ServicesProps> = {
  label: "Services",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    text: richTextField("Introduction"),
    services: {
      type: "array",
      label: "Services",
      getItemSummary: (item) => item.title || "Service",
      defaultItemProps: {
        icon: "star",
        title: "New service",
        text: "<p>Describe this service.</p>",
        image: "/samples/home-interior.jpg",
        imageAlt: "Sample of a welcoming home interior",
      },
      arrayFields: {
        icon: iconField("Icon"),
        title: { type: "text", label: "Title", contentEditable: true },
        text: richTextField("Text"),
        image: imageField("Image"),
        imageAlt: { type: "text", label: "Image alt text" },
      },
    },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Icon grid", value: "grid" },
        { label: "Bordered grid", value: "bordered" },
        { label: "Image cards", value: "image-cards" },
        { label: "Alternating image rows", value: "image-rows" },
        { label: "Icon list", value: "list" },
        { label: "Tabs", value: "tabs" },
        { label: "Vertical tabs", value: "tabs-vertical" },
        { label: "Text tabs", value: "tabs-simple" },
      ],
    },
  },
  defaultProps: {
    design: {},
    eyebrow: "What we do",
    heading: "Our services",
    text: "",
    services: [
      { icon: "wrench", title: "Service one", text: "<p>Describe this service.</p>", image: "/samples/tools.jpg", imageAlt: "Sample of tools ready for a project" },
      { icon: "clock", title: "Service two", text: "<p>Describe this service.</p>", image: "/samples/home-interior.jpg", imageAlt: "Sample of a comfortable home interior" },
      { icon: "shield-check", title: "Service three", text: "<p>Describe this service.</p>", image: "/samples/home-exterior.jpg", imageAlt: "Sample of a well-kept home exterior" },
    ],
    variant: "grid",
  },
  render: ({ eyebrow, heading, text, services, variant = "grid", puck }) => {
    const intro = (
      <div className={`flex min-w-0 flex-col gap-4 ${variant === "grid" || variant === "image-cards" ? "mx-auto max-w-[43rem] items-center text-center" : "max-w-[43rem]"}`}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading level={2}>{heading}</Heading>
        <RichTextContent value={text} className="w-full text-base" />
      </div>
    );

    if (variant === "list") {
      return (
        <Section background="soft">
          <div className="grid items-start gap-10 lg:grid-cols-5 lg:gap-16">
            <div className="lg:col-span-2">{intro}</div>
            <div className="min-w-0 lg:col-span-3">
              {services.map((service, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 border-b py-6 first:pt-0 last:border-b-0 last:pb-0 sm:gap-6"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <IconTile name={service.icon} editPath={puck.isEditing ? `services.${i}.icon` : undefined} />
                  <div className="flex min-w-0 flex-col gap-2">
                    <Heading level={3}>{service.title}</Heading>
                    <RichTextContent value={service.text} className="w-full text-base" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      );
    }

    if (variant === "image-rows") {
      return (
        <Section>
          {intro}
          <div className="mt-[var(--section-gap)] flex flex-col gap-[var(--section-gap)]">
            {services.map((service, i) => (
              <div key={i} className="grid items-center gap-7 md:grid-cols-2 md:gap-12">
                <ServiceImage service={service} className={i % 2 === 1 ? "md:order-2" : ""} />
                <div className="flex min-w-0 flex-col gap-4 md:py-6">
                  <IconTile name={service.icon} editPath={puck.isEditing ? `services.${i}.icon` : undefined} />
                  <Heading level={3} style={{ fontSize: "clamp(1.5rem, 2.4vw, 2rem)" }}>
                    {service.title}
                  </Heading>
                  <RichTextContent value={service.text} className="w-full text-base" />
                </div>
              </div>
            ))}
          </div>
        </Section>
      );
    }

    if (variant === "tabs" || variant === "tabs-vertical" || variant === "tabs-simple") {
      return (
        <Section>
          {intro}
          <div className="mt-[var(--section-gap)]">
            <Tabs
              label={typeof heading === "string" ? heading : "Our services"}
              vertical={variant === "tabs-vertical"}
              items={services.map((service, i) => ({
                label: service.title,
                content: (
                  <div className={`grid items-center gap-7 md:gap-12 ${variant === "tabs-simple" ? "" : "md:grid-cols-2"}`}>
                    {variant !== "tabs-simple" ? <ServiceImage service={service} /> : null}
                    <div className="flex min-w-0 flex-col gap-4">
                      <IconTile name={service.icon} editPath={puck.isEditing ? `services.${i}.icon` : undefined} />
                      <Heading level={3} style={{ fontSize: "clamp(1.5rem, 2.4vw, 2rem)" }}>
                        {service.title}
                      </Heading>
                      <RichTextContent value={service.text} className="w-full text-base" />
                    </div>
                  </div>
                ),
              }))}
            />
          </div>
        </Section>
      );
    }

    if (variant === "bordered") {
      return (
        <Section>
          {intro}
          <div
            className="mt-[var(--section-gap)] grid gap-px overflow-hidden border sm:grid-cols-2 lg:grid-cols-3"
            style={{
              borderColor: "var(--color-border)",
              borderRadius: "var(--radius-lg)",
              backgroundColor: "var(--color-border)",
            }}
          >
            {services.map((service, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-4 p-6 sm:p-8" style={{ backgroundColor: "var(--color-bg)" }}>
                <div className="flex items-center justify-between gap-4">
                  <IconTile name={service.icon} editPath={puck.isEditing ? `services.${i}.icon` : undefined} />
                  <span aria-hidden="true" className="text-xs tabular-nums" style={{ color: "var(--color-muted)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <Heading level={3}>{service.title}</Heading>
                <RichTextContent value={service.text} className="w-full text-sm" />
              </div>
            ))}
          </div>
        </Section>
      );
    }

    return (
      <Section background={variant === "image-cards" ? "default" : "soft"}>
        {intro}
        <div className="mt-[var(--section-gap)] grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, i) => (
            <Card
              key={i}
              className="min-w-0"
              style={variant === "image-cards" ? { padding: 0, overflow: "hidden", gap: 0 } : undefined}
            >
              {variant === "image-cards" ? (
                <>
                  <ServiceImage service={service} className="rounded-b-none!" />
                  <div className="flex flex-1 flex-col gap-3 p-6 sm:p-7">
                    <Heading level={3}>{service.title}</Heading>
                    <RichTextContent value={service.text} className="w-full text-sm" />
                  </div>
                </>
              ) : (
                <>
                  <IconTile name={service.icon} editPath={puck.isEditing ? `services.${i}.icon` : undefined} />
                  <Heading level={3}>{service.title}</Heading>
                  <RichTextContent value={service.text} className="w-full text-sm" />
                </>
              )}
            </Card>
          ))}
        </div>
      </Section>
    );
  },
};
