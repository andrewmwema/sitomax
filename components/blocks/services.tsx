import type { ComponentConfig, RichText } from "@puckeditor/core";
import { iconField, richTextField } from "@/lib/puck/fields";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { Card } from "./ui/card";
import { IconTile } from "./ui/icon-tile";
import { RichTextContent } from "./ui/rich-text";

export type ServicesProps = {
  eyebrow: string;
  heading: string;
  services: { icon: string; title: string; text: RichText }[];
  variant: "grid" | "list";
};

export const Services: ComponentConfig<ServicesProps> = {
  label: "Services",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    services: {
      type: "array",
      label: "Services",
      getItemSummary: (item) => item.title || "Service",
      defaultItemProps: {
        icon: "star",
        title: "New service",
        text: "<p>Describe this service.</p>",
      },
      arrayFields: {
        icon: iconField("Icon"),
        title: { type: "text", label: "Title", contentEditable: true },
        text: richTextField("Text"),
      },
    },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Grid", value: "grid" },
        { label: "List", value: "list" },
      ],
    },
  },
  defaultProps: {
    eyebrow: "What we do",
    heading: "Our services",
    services: [
      { icon: "wrench", title: "Service one", text: "<p>Describe this service.</p>" },
      { icon: "clock", title: "Service two", text: "<p>Describe this service.</p>" },
      { icon: "shield-check", title: "Service three", text: "<p>Describe this service.</p>" },
    ],
    variant: "grid",
  },
  render: ({ eyebrow, heading, services, variant }) => (
    <Section background="soft">
      <div className="flex flex-col items-center gap-3 text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading level={2}>{heading}</Heading>
      </div>
      {(variant ?? "grid") === "list" ? (
        <div className="mx-auto mt-12 flex max-w-[52rem] flex-col gap-4">
          {services.map((service, i) => (
            <Card key={i}>
              <div className="flex items-start gap-5">
                <IconTile name={service.icon} />
                <div className="flex flex-col gap-2">
                  <Heading level={3}>{service.title}</Heading>
                  <RichTextContent value={service.text} className="w-full text-sm" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, i) => (
            <Card key={i}>
              <IconTile name={service.icon} />
              <Heading level={3}>{service.title}</Heading>
              <RichTextContent value={service.text} className="w-full text-sm" />
            </Card>
          ))}
        </div>
      )}
    </Section>
  ),
};
