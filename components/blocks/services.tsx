import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, iconField, imageField, linkField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { LinkValue } from "@/lib/links";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading, RichHeading } from "./ui/heading";
import { Card } from "./ui/card";
import { IconTile } from "./ui/icon-tile";
import { RichTextContent } from "./ui/rich-text";
import { Tabs } from "./ui/tabs";
import { Button } from "./ui/button";
import { ConversionActions } from "./ui/conversion-actions";
import type { IconValue } from "@/lib/icons";

export type ServiceItem = {
  icon: IconValue;
  title: string;
  text: RichText;
  image: string;
  imageAlt: string;
  actionText?: string;
  actionLink?: LinkValue;
};

export type ServicesProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text?: RichText;
  services: ServiceItem[];
  buttonText?: string;
  buttonLink?: LinkValue;
  buttonAction?: "link" | "form-popup";
  buttonFormName?: string;
  secondaryButtonText?: string;
  secondaryButtonLink?: LinkValue;
  secondaryButtonAction?: "link" | "form-popup";
  secondaryButtonFormName?: string;
  trustLine?: string;
  variant: "grid" | "bordered" | "image-cards" | "image-rows" | "list" | "tabs" | "tabs-vertical" | "tabs-simple" | "audience-paths" | "feature-showcase";
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
    heading: richHeadingField("Heading", 2),
    text: richTextField("Introduction"),
    buttonText: { type: "text", label: "Section button text", contentEditable: true },
    buttonAction: {
      type: "select",
      label: "Primary action",
      options: [{ label: "Link or scroll", value: "link" }, { label: "Form popup", value: "form-popup" }],
    },
    buttonLink: linkField("Section button link"),
    buttonFormName: { type: "text", label: "Popup form name" },
    secondaryButtonText: { type: "text", label: "Second button text", contentEditable: true },
    secondaryButtonAction: {
      type: "select",
      label: "Second action",
      options: [{ label: "Link or scroll", value: "link" }, { label: "Form popup", value: "form-popup" }],
    },
    secondaryButtonLink: linkField("Second button link"),
    secondaryButtonFormName: { type: "text", label: "Second popup form name" },
    trustLine: { type: "text", label: "Trust line under buttons", contentEditable: true },
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
        actionText: "",
        actionLink: "",
      },
      arrayFields: {
        icon: iconField("Icon"),
        title: { type: "text", label: "Title", contentEditable: true },
        text: richTextField("Text"),
        image: imageField("Image", "4/3"),
        imageAlt: { type: "text", label: "Image alt text" },
        actionText: { type: "text", label: "Learn more button text", contentEditable: true },
        actionLink: linkField("Learn more link"),
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
        { label: "Audience paths", value: "audience-paths" },
        { label: "Feature showcase", value: "feature-showcase" },
      ],
    },
  },
  defaultProps: {
    design: {},
    eyebrow: "What we do",
    heading: "Our services",
    text: "",
    buttonText: "",
    buttonLink: "",
    buttonAction: "link",
    secondaryButtonText: "",
    secondaryButtonLink: "",
    secondaryButtonAction: "link",
    trustLine: "",
    services: [
      { icon: "wrench", title: "Service one", text: "<p>Describe this service.</p>", image: "/samples/tools.jpg", imageAlt: "Sample of tools ready for a project" },
      { icon: "clock", title: "Service two", text: "<p>Describe this service.</p>", image: "/samples/home-interior.jpg", imageAlt: "Sample of a comfortable home interior" },
      { icon: "shield-check", title: "Service three", text: "<p>Describe this service.</p>", image: "/samples/home-exterior.jpg", imageAlt: "Sample of a well-kept home exterior" },
    ],
    variant: "grid",
  },
  render: ({
    eyebrow, heading, text, services, variant = "grid", puck,
    buttonText, buttonLink, buttonAction, buttonFormName,
    secondaryButtonText, secondaryButtonLink, secondaryButtonAction, secondaryButtonFormName, trustLine,
  }) => {
    const actions = (
      <ConversionActions
        primary={buttonText ? { label: buttonText, mode: buttonAction, link: buttonLink, formName: buttonFormName } : undefined}
        secondary={secondaryButtonText ? { label: secondaryButtonText, mode: secondaryButtonAction, link: secondaryButtonLink, formName: secondaryButtonFormName } : undefined}
        trustLine={trustLine}
        center={variant === "grid" || variant === "image-cards" || variant === "audience-paths"}
      />
    );
    const intro = (
      <div className={`section-intro flex min-w-0 flex-col gap-4 ${variant === "grid" || variant === "image-cards" || variant === "audience-paths" ? "mx-auto max-w-[43rem] items-center text-center" : "max-w-[43rem]"}`}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <RichHeading level={2}>{heading}</RichHeading>
        <RichTextContent value={text} className="w-full text-base" />
      </div>
    );

    if (variant === "audience-paths") {
      return (
        <Section background="soft">
          {intro}
          <div className="mt-[var(--section-gap)] grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service, i) => (
              <article key={i} className="site-card flex min-w-0 flex-col items-start gap-5 rounded-[var(--radius-lg)] border p-6 sm:p-8"
                style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}>
                <div className="flex w-full items-center justify-between gap-4">
                  <IconTile name={service.icon} editPath={puck.isEditing ? `services.${i}.icon` : undefined} />
                  <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-muted)" }}>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="flex flex-1 flex-col gap-3">
                  <Heading level={3}>{service.title}</Heading>
                  <RichTextContent value={service.text} className="w-full text-sm" />
                </div>
                {service.actionText ? <Button href={service.actionLink} variant="secondary">{service.actionText}</Button> : null}
              </article>
            ))}
          </div>
          {actions}
        </Section>
      );
    }

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
                    {service.actionText ? <Button href={service.actionLink} variant="secondary" className="mt-2 self-start">{service.actionText}</Button> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {actions}
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
                  {service.actionText ? <Button href={service.actionLink} variant="secondary" className="self-start">{service.actionText}</Button> : null}
                </div>
              </div>
            ))}
          </div>
          {actions}
        </Section>
      );
    }

    if (variant === "feature-showcase") {
      return (
        <Section>
          {intro}
          <div className="mt-[var(--section-gap)] flex flex-col gap-10 lg:gap-16">
            {services.map((service, i) => (
              <article key={i} className="grid items-center gap-8 border-t pt-8 first:border-t-0 first:pt-0 md:grid-cols-2 md:gap-12 lg:gap-20"
                style={{ borderColor: "var(--color-border)" }}>
                <div className={i % 2 === 1 ? "md:order-2" : ""}>
                  <ServiceImage service={service} className="aspect-[5/4]" />
                </div>
                <div className="flex min-w-0 flex-col items-start gap-4">
                  <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-secondary)" }}>Benefit / {String(i + 1).padStart(2, "0")}</p>
                  <IconTile name={service.icon} editPath={puck.isEditing ? `services.${i}.icon` : undefined} />
                  <Heading level={3} style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}>{service.title}</Heading>
                  <RichTextContent value={service.text} className="w-full text-base" />
                  {service.actionText ? <Button href={service.actionLink} variant="secondary">{service.actionText}</Button> : null}
                </div>
              </article>
            ))}
          </div>
          {actions}
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
                      {service.actionText ? <Button href={service.actionLink} variant="secondary" className="self-start">{service.actionText}</Button> : null}
                    </div>
                  </div>
                ),
              }))}
            />
          </div>
          {actions}
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
                {service.actionText ? <Button href={service.actionLink} variant="secondary" className="mt-2 self-start">{service.actionText}</Button> : null}
              </div>
            ))}
          </div>
          {actions}
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
                    {service.actionText ? <Button href={service.actionLink} variant="secondary" className="mt-2 self-start">{service.actionText}</Button> : null}
                  </div>
                </>
              ) : (
                <>
                  <IconTile name={service.icon} editPath={puck.isEditing ? `services.${i}.icon` : undefined} />
                  <Heading level={3}>{service.title}</Heading>
                  <RichTextContent value={service.text} className="w-full text-sm" />
                  {service.actionText ? <Button href={service.actionLink} variant="secondary" className="self-start">{service.actionText}</Button> : null}
                </>
              )}
            </Card>
          ))}
        </div>
        {actions}
      </Section>
    );
  },
};
