import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, iconField, imageField, linkField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { LinkValue } from "@/lib/links";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Heading, RichHeading } from "./ui/heading";
import { Eyebrow } from "./ui/eyebrow";
import { Card } from "./ui/card";
import { BlockIcon } from "./ui/icon";
import { RichTextContent } from "./ui/rich-text";
import { ConversionActions } from "./ui/conversion-actions";
import type { IconValue } from "@/lib/icons";

export type ProcessProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text: RichText;
  variant: "steps" | "timeline" | "checklist";
  image: string;
  imageAlt: string;
  buttonText?: string;
  buttonLink?: LinkValue;
  buttonAction?: "link" | "form-popup";
  buttonFormName?: string;
  secondaryButtonText?: string;
  secondaryButtonLink?: LinkValue;
  secondaryButtonAction?: "link" | "form-popup";
  secondaryButtonFormName?: string;
  trustLine?: string;
  steps: { title: string; text: RichText; icon: IconValue }[];
};

export const Process: ComponentConfig<ProcessProps> = {
  label: "Process",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow", contentEditable: true },
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
    variant: { type: "select", label: "Layout", options: [{ label: "Numbered step cards", value: "steps" }, { label: "Editorial timeline", value: "timeline" }, { label: "Photo + checklist", value: "checklist" }] },
    image: imageField("Photo", "4/3"), imageAlt: { type: "text", label: "Photo alt text" },
    steps: {
      type: "array", label: "Steps", getItemSummary: (step) => step.title || "Step",
      defaultItemProps: { title: "The next step", text: "<p>Explain what happens at this stage.</p>", icon: "check" },
      arrayFields: { title: { type: "text", label: "Title" }, text: richTextField("Description"), icon: iconField("Icon") },
    },
  },
  defaultProps: {
    design: {}, eyebrow: "How it works", heading: "From first idea to finishing touch",
    text: "<p>A clear path forward, with time to ask questions along the way.</p>",
    buttonText: "", buttonLink: "", buttonAction: "link",
    secondaryButtonText: "", secondaryButtonLink: "", secondaryButtonAction: "link",
    trustLine: "",
    variant: "steps", image: "/samples/team-at-work.jpg", imageAlt: "Sample of a team planning a project",
    steps: [
      { title: "Tell us what you have in mind", text: "<p>Share your ideas, your priorities and anything you would like help working out.</p>", icon: "mail" },
      { title: "Make a plan together", text: "<p>Explore the options and agree the scope, timing and next steps before work begins.</p>", icon: "ruler" },
      { title: "Bring the details together", text: "<p>See the plan take shape, then walk through the result and discuss how to care for it.</p>", icon: "sparkles" },
    ],
  },
  render: ({
    eyebrow, heading, text, steps, variant, image, imageAlt, puck,
    buttonText, buttonLink, buttonAction, buttonFormName,
    secondaryButtonText, secondaryButtonLink, secondaryButtonAction, secondaryButtonFormName, trustLine,
  }) => (
    <Section background={variant === "steps" ? "soft" : "default"}>
      <div className={`grid gap-12 ${variant === "checklist" ? "items-center lg:grid-cols-2" : ""}`}>
        <div className="flex flex-col gap-4">
          <div className="section-intro flex max-w-2xl flex-col gap-4">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <RichHeading level={2}>{heading}</RichHeading>
            <RichTextContent value={text} />
          </div>
          {variant === "checklist" && image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={image} alt={imageAlt} loading="lazy" className="mt-[var(--content-gap)] aspect-[4/3] w-full object-cover" style={{ borderRadius: "var(--radius-lg)" }} />
          ) : null}
        </div>
        <ol className={variant === "steps" ? "grid gap-5 md:grid-cols-3" : variant === "timeline" ? "mx-auto w-full max-w-4xl border-l pl-6 sm:pl-10" : "flex flex-col gap-7"} style={{ borderColor: "var(--color-border)" }}>
          {steps.map((step, i) => {
            const content = <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold tracking-widest" style={{ color: "var(--color-muted)" }}>{String(i + 1).padStart(2, "0")}</span>
                <BlockIcon name={step.icon} size={26} editPath={puck.isEditing ? `steps.${i}.icon` : undefined} />
              </div>
              <Heading level={3}>{step.title}</Heading>
              <RichTextContent value={step.text} />
            </>;
            return <li key={i} className={variant === "timeline" ? "relative border-b py-8 first:pt-0 last:border-0" : variant === "checklist" ? "border-b pb-7 last:border-0" : "min-w-0"} style={{ borderColor: "var(--color-border)" }}>
              {variant === "steps" ? <Card className="h-full gap-6">{content}</Card> : <div className={`flex flex-col gap-4 ${variant === "timeline" ? "md:ml-auto md:w-4/5" : ""}`}>{content}</div>}
              {variant === "timeline" ? <span aria-hidden="true" className="absolute -left-[1.9rem] top-8 h-3 w-3 rounded-full first:top-1 sm:-left-[2.9rem]" style={{ backgroundColor: "var(--color-secondary)" }} /> : null}
            </li>;
          })}
        </ol>
      </div>
      <ConversionActions
        primary={buttonText ? { label: buttonText, mode: buttonAction, link: buttonLink, formName: buttonFormName } : undefined}
        secondary={secondaryButtonText ? { label: secondaryButtonText, mode: secondaryButtonAction, link: secondaryButtonLink, formName: secondaryButtonFormName } : undefined}
        trustLine={trustLine}
      />
    </Section>
  ),
};
