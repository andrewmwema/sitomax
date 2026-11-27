import type { ComponentConfig } from "@puckeditor/core";
import { GraderEmbeddedForm } from "@/components/grader/scan-form";
import { designField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";

export type WebsiteGraderProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  description: string;
  trustLine: string;
  variant: "centered" | "split";
};

export const WebsiteGrader: ComponentConfig<WebsiteGraderProps> = {
  label: "Website Grader",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    description: { type: "textarea", label: "Description" },
    trustLine: { type: "text", label: "Trust line", contentEditable: true },
    variant: { type: "radio", label: "Layout", options: [
      { label: "Centered", value: "centered" }, { label: "Split", value: "split" },
    ] },
  },
  defaultProps: {
    design: {}, eyebrow: "Free website grade", heading: "How good is your website?",
    description: "Get a free grade and discover practical ways to improve your website.",
    trustLine: "Free · No signup to see your score · Takes about a minute",
    variant: "centered",
  },
  render: ({ eyebrow, heading, description, trustLine, variant, puck }) => <Section background="soft">
    <div className={variant === "split" ? "grid items-center gap-8 md:grid-cols-2" : "mx-auto max-w-3xl"}>
      <div className="flex flex-col gap-5">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 className="text-3xl font-semibold sm:text-4xl" style={{ fontFamily: "var(--font-heading)" }}>{heading}</h2>
        <p className="text-lg" style={{ color: "var(--color-muted)" }}>{description}</p>
      </div>
      <div className={variant === "split" ? "" : "mt-5"}>
        <GraderEmbeddedForm preview={puck.isEditing || puck.metadata?.sectionThumbnail === true} />
        {trustLine ? <p className="mt-4 text-sm" style={{ color: "var(--color-muted)" }}>{trustLine}</p> : null}
      </div>
    </div>
  </Section>,
};
