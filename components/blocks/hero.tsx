import type { ComponentConfig, RichText } from "@puckeditor/core";
import type { CSSProperties, ReactNode } from "react";
import { designField, linkField, imageField, iconField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { LinkValue } from "@/lib/links";
import type { IconValue } from "@/lib/icons";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Container } from "./ui/container";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { BlockIcon } from "./ui/icon";
import { FormSubmission } from "./ui/form-submission";
import { RichTextContent } from "./ui/rich-text";
import { ConversionActions } from "./ui/conversion-actions";
import type { ConversionAction } from "./ui/conversion-actions";

export type HeroStat = { value: string; label: string };

export type HeroFormField = {
  label: string;
  fieldType: "text" | "email" | "tel";
  required: boolean;
};

export type HeroVariant = "centered" | "split" | "overlay" | "lead-form" | "stats";

export type HeroProps = {
  eyebrow: string;
  /** Pill badge; replaces the eyebrow when set. */
  badgeText?: string;
  badgeIcon: IconValue;
  heading: string;
  subheading: RichText;
  buttonText: string;
  buttonLink: LinkValue;
  buttonAction?: "link" | "form-popup";
  buttonFormName?: string;
  secondaryButtonText?: string;
  secondaryButtonLink?: LinkValue;
  secondaryButtonAction?: "link" | "form-popup";
  secondaryButtonFormName?: string;
  trustLine?: string;
  backgroundImage: string;
  backgroundImageAlt?: string;
  /** Second photo for the collage shown by the "stats" variant. */
  secondaryImage: string;
  secondaryImageAlt?: string;
  variant: HeroVariant;
  /** Shown by the "stats" variant as a row under the heading. */
  stats?: HeroStat[];
  /** Lead form settings, used by the "lead-form" variant. */
  formName?: string;
  submitText?: string;
  formFields?: HeroFormField[];
  design?: BlockDesign;
  /** @deprecated legacy prop, replaced by variant. */
  layout?: "centered" | "split";
};

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

/** Badge when set, otherwise the eyebrow label. */
function HeroLabel({ badgeText, badgeIcon = "star", eyebrow, editing }: {
  badgeText?: string; badgeIcon?: IconValue; eyebrow: string; editing: boolean;
}) {
  if (badgeText) {
    return (
      <Badge>
        <BlockIcon name={badgeIcon} size={13} editPath={editing ? "badgeIcon" : undefined} />
        {badgeText}
      </Badge>
    );
  }
  return eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null;
}

/** Primary + optional secondary CTA; full width under 480px. */
function HeroButtons({
  buttonText,
  buttonLink,
  buttonAction,
  buttonFormName,
  secondaryButtonText,
  secondaryButtonLink,
  secondaryButtonAction,
  secondaryButtonFormName,
  trustLine,
  center = false,
}: Pick<
  HeroProps,
  | "buttonText"
  | "buttonLink"
  | "buttonAction"
  | "buttonFormName"
  | "secondaryButtonText"
  | "secondaryButtonLink"
  | "secondaryButtonAction"
  | "secondaryButtonFormName"
  | "trustLine"
> & { center?: boolean }) {
  const primary: ConversionAction | undefined = buttonText ? {
    label: buttonText,
    link: buttonLink,
    mode: buttonAction,
    formName: buttonFormName,
  } : undefined;
  const secondary: ConversionAction | undefined = secondaryButtonText ? {
    label: secondaryButtonText,
    link: secondaryButtonLink,
    mode: secondaryButtonAction,
    formName: secondaryButtonFormName,
  } : undefined;
  return (
    <ConversionActions
      primary={primary}
      secondary={secondary}
      trustLine={trustLine}
      center={center}
    />
  );
}

function Subheading({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <RichTextContent
      value={children}
      className={`max-w-[60ch] text-lg ${className}`}
      style={{
        color: "var(--color-muted)",
        lineHeight: 1.6,
        ...style,
        ...(style?.color ? { "--color-muted": style.color } : {}),
      } as CSSProperties}
    />
  );
}

const leadInputStyle: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  backgroundColor: "var(--color-bg)",
  color: "var(--color-text)",
  lineHeight: 1.6,
};

/* ------------------------------------------------------------------ */
/* Block                                                               */
/* ------------------------------------------------------------------ */

export const Hero: ComponentConfig<HeroProps> = {
  label: "Hero",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    badgeText: {
      type: "text",
      label: "Badge (replaces eyebrow)",
      contentEditable: true,
    },
    badgeIcon: iconField("Badge icon"),
    heading: richHeadingField("Heading", 1),
    subheading: richTextField("Subheading"),
    buttonText: { type: "text", label: "Button text", contentEditable: true },
    buttonAction: {
      type: "select",
      label: "Primary action",
      options: [{ label: "Link or scroll", value: "link" }, { label: "Form popup", value: "form-popup" }],
    },
    buttonLink: linkField("Button link"),
    buttonFormName: { type: "text", label: "Popup form name" },
    secondaryButtonText: {
      type: "text",
      label: "Second button text",
      contentEditable: true,
    },
    secondaryButtonAction: {
      type: "select",
      label: "Second action",
      options: [{ label: "Link or scroll", value: "link" }, { label: "Form popup", value: "form-popup" }],
    },
    secondaryButtonLink: linkField("Second button link"),
    secondaryButtonFormName: { type: "text", label: "Second popup form name" },
    trustLine: { type: "text", label: "Trust line under buttons", contentEditable: true },
    backgroundImage: imageField("Image", "16/9"),
    backgroundImageAlt: { type: "text", label: "Image alt text" },
    secondaryImage: imageField("Second image (collage)", "4/3"),
    secondaryImageAlt: { type: "text", label: "Second image alt text" },
    variant: {
      type: "select",
      label: "Layout",
      options: [
        { label: "Centered band", value: "centered" },
        { label: "Split with image", value: "split" },
        { label: "Photo with overlay", value: "overlay" },
        { label: "With lead form", value: "lead-form" },
        { label: "With stats row", value: "stats" },
      ],
    },
    stats: {
      type: "array",
      label: "Stats",
      getItemSummary: (item) => item.label || "Stat",
      defaultItemProps: { value: "100%", label: "Satisfaction guarantee" },
      arrayFields: {
        value: { type: "text", label: "Value" },
        label: { type: "text", label: "Label" },
      },
    },
    formName: { type: "text", label: "Form name", placeholder: "quote" },
    submitText: { type: "text", label: "Submit button text", contentEditable: true },
    formFields: {
      type: "array",
      label: "Form fields",
      getItemSummary: (item) => item.label || "Field",
      defaultItemProps: { label: "New field", fieldType: "text", required: false },
      arrayFields: {
        label: { type: "text", label: "Label" },
        fieldType: {
          type: "select",
          label: "Type",
          options: [
            { label: "Text", value: "text" },
            { label: "Email", value: "email" },
            { label: "Phone", value: "tel" },
          ],
        },
        required: {
          type: "radio",
          label: "Required",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false },
          ],
        },
      },
    },
    design: designField(),
  },
  // Only show the fields the chosen layout actually uses.
  resolveFields: (data, { fields }) => {
    const variant = data.props.variant ?? data.props.layout ?? "centered";
    const {
      backgroundImage, backgroundImageAlt, secondaryImage, secondaryImageAlt, stats,
      formName, submitText, formFields, buttonLink, buttonFormName,
      secondaryButtonLink, secondaryButtonFormName, ...rest
    } =
      fields;
    return {
      ...rest,
      ...(data.props.buttonAction === "form-popup" ? { buttonFormName } : { buttonLink }),
      ...(data.props.secondaryButtonAction === "form-popup" ? { secondaryButtonFormName } : { secondaryButtonLink }),
      ...(variant === "lead-form" ? null : { backgroundImage, backgroundImageAlt }),
      ...(variant === "stats" ? { secondaryImage, secondaryImageAlt, stats } : null),
      ...(variant === "lead-form" ? { formName, submitText, formFields } : null),
      // Hidden fields stay typed as present; Puck only renders the
      // returned subset, so narrowing back to the full shape is safe.
    } as typeof fields;
  },
  defaultProps: {
    eyebrow: "Trusted local experts",
    badgeText: "",
    badgeIcon: "star",
    heading: "Grow your business with us",
    subheading: "We make it easy for your customers to find and contact you.",
    buttonText: "Get in touch",
    buttonAction: "link",
    buttonLink: "/contact",
    secondaryButtonText: "",
    secondaryButtonAction: "link",
    secondaryButtonLink: "",
    buttonFormName: "hero-enquiry",
    secondaryButtonFormName: "hero-enquiry",
    trustLine: "",
    backgroundImage: "",
    backgroundImageAlt: "",
    secondaryImage: "",
    secondaryImageAlt: "",
    variant: "centered",
    stats: [
      { value: "[20]+", label: "Years in business" },
      { value: "[1,500]+", label: "Projects completed" },
      { value: "[4.9]/5", label: "Average rating" },
      { value: "[100]%", label: "Satisfaction guarantee" },
    ],
    formName: "quote",
    submitText: "Get my free quote",
    formFields: [
      { label: "Name", fieldType: "text", required: true },
      { label: "Phone", fieldType: "tel", required: false },
      { label: "Email", fieldType: "email", required: true },
    ],
    design: {},
  },
  render: ({
    eyebrow,
    badgeText,
    badgeIcon,
    heading,
    subheading,
    buttonText,
    buttonLink,
    buttonAction,
    buttonFormName,
    secondaryButtonText,
    secondaryButtonLink,
    secondaryButtonAction,
    secondaryButtonFormName,
    trustLine,
    backgroundImage,
    backgroundImageAlt,
    secondaryImage,
    secondaryImageAlt,
    variant,
    stats,
    formName,
    submitText,
    formFields,
    layout,
    puck,
  }) => {
    const resolved: HeroVariant = variant ?? layout ?? "centered";
    const buttons = (center = false) => (
      <HeroButtons
        buttonText={buttonText}
        buttonLink={buttonLink}
        buttonAction={buttonAction}
        buttonFormName={buttonFormName}
        secondaryButtonText={secondaryButtonText}
        secondaryButtonLink={secondaryButtonLink}
        secondaryButtonAction={secondaryButtonAction}
        secondaryButtonFormName={secondaryButtonFormName}
        trustLine={trustLine}
        center={center}
      />
    );

    /* ------------------------------------------------- Split image */
    if (resolved === "split") {
      return (
        <Section container={false}>
          <Container className="grid items-center gap-12 md:grid-cols-2 lg:gap-16">
            <div className="section-intro flex flex-col items-start gap-5">
              <HeroLabel badgeText={badgeText} badgeIcon={badgeIcon} eyebrow={eyebrow} editing={puck.isEditing} />
              <RichHeading level={1}>{heading}</RichHeading>
              <Subheading>{subheading}</Subheading>
              {buttons()}
            </div>
            <div className="relative">
              {/* Offset accent frame behind the image. */}
              <div
                aria-hidden="true"
                className="absolute hidden md:block"
                style={{
                  inset: "1.25rem -1.25rem -1.25rem 1.25rem",
                  border: "2px solid var(--color-secondary)",
                  borderRadius: "var(--radius-lg)",
                  opacity: 0.45,
                }}
              />
              {backgroundImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={backgroundImage}
                  alt={backgroundImageAlt || ""}
                  className="relative h-72 w-full object-cover sm:h-96"
                  style={{
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-card)",
                  }}
                />
              ) : (
                <div
                  className="relative flex h-72 w-full items-center justify-center sm:h-96"
                  style={{
                    backgroundColor: "var(--color-soft-bg)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <BlockIcon name="camera" size={34} className="opacity-25" />
                </div>
              )}
            </div>
          </Container>
        </Section>
      );
    }

    /* -------------------------------- Full-width photo with overlay */
    if (resolved === "overlay") {
      return (
        <Section
          background="dark"
          container={false}
          className="relative overflow-hidden"
          style={
            backgroundImage
              ? ({
                  backgroundImage: `url(${backgroundImage})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  "--eyebrow-color": "rgba(248, 250, 252, 0.92)",
                } as CSSProperties)
              : undefined
          }
        >
          {backgroundImage ? (
            <div
              className="absolute inset-0"
              style={{ backgroundColor: "rgba(10, 14, 20, 0.56)" }}
            />
          ) : null}
          <Container className="relative flex min-h-[380px] flex-col justify-center gap-6 sm:min-h-[460px]">
            <div className="section-intro flex max-w-2xl flex-col items-start gap-5">
              <HeroLabel badgeText={badgeText} badgeIcon={badgeIcon} eyebrow={eyebrow} editing={puck.isEditing} />
              <RichHeading
                level={1}
                style={backgroundImage ? { color: "#ffffff" } : undefined}
              >
                {heading}
              </RichHeading>
              <Subheading
                style={
                  backgroundImage ? { color: "rgba(255,255,255,0.84)" } : undefined
                }
              >
                {subheading}
              </Subheading>
              {buttons()}
            </div>
          </Container>
        </Section>
      );
    }

    /* ------------------------------------------------ Lead form */
    if (resolved === "lead-form") {
      const fields = formFields ?? [];
      return (
        <Section background="dark" container={false}>
          <Container className="grid items-center gap-12 lg:grid-cols-[1.05fr_minmax(0,30rem)] lg:gap-16">
            <div className="section-intro flex flex-col items-start gap-5">
              <HeroLabel badgeText={badgeText} badgeIcon={badgeIcon} eyebrow={eyebrow} editing={puck.isEditing} />
              <RichHeading level={1}>{heading}</RichHeading>
              <Subheading>{subheading}</Subheading>
              {buttons()}
            </div>
            <Card
              className="gap-0 p-6 sm:p-8"
              style={{
                // Reset the dark-band tints: this card sits on the theme
                // background again, so derive muted/border from its text.
                "--color-muted": "color-mix(in srgb, var(--color-text) 72%, transparent)",
                "--color-border": "color-mix(in srgb, var(--color-text) 16%, transparent)",
                "--btn-bg": "var(--color-primary)",
                "--btn-fg": "var(--color-on-primary)",
                "--btn-outline": "var(--color-border)",
              } as CSSProperties}
            >
              <FormSubmission className="flex flex-col gap-4">
                <input type="hidden" name="_form_name" value={formName || "quote"} />
                {/* Honeypot field for spam bots: humans never see it. */}
                <input
                  type="text"
                  name="_website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                />
                {fields.map((field, i) => {
                  const id = `hero-field-${i}`;
                  return (
                    <label
                      key={i}
                      htmlFor={id}
                      className="flex flex-col gap-1.5 text-sm font-medium"
                    >
                      {field.label}
                      <input
                        id={id}
                        name={field.label}
                        type={field.fieldType}
                        required={field.required}
                        className="min-h-12 w-full px-3.5 py-2.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
                        style={leadInputStyle}
                      />
                    </label>
                  );
                })}
                <button
                  type="submit"
                  className="min-h-12 px-5 py-3 text-sm font-semibold transition hover:-translate-y-px hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    backgroundColor: "var(--color-primary)",
                    color: "var(--color-on-primary)",
                    borderRadius: "var(--radius-sm)",
                    outlineColor: "var(--color-secondary)",
                  }}
                >
                  {submitText || "Send"}
                </button>
              </FormSubmission>
            </Card>
          </Container>
        </Section>
      );
    }

    /* ------------------------------------------------- Stats row */
    if (resolved === "stats") {
      const items = stats ?? [];
      const content = (
        <div className="section-intro flex max-w-2xl flex-col items-start gap-5">
          <HeroLabel badgeText={badgeText} badgeIcon={badgeIcon} eyebrow={eyebrow} editing={puck.isEditing} />
          <RichHeading level={1}>{heading}</RichHeading>
          <Subheading>{subheading}</Subheading>
          {buttons()}
        </div>
      );
      return (
        <Section container={false}>
          <Container className="flex flex-col gap-12 lg:gap-16">
            {backgroundImage ? (
              <div className="grid items-center gap-12 md:grid-cols-[1.1fr_0.9fr] lg:gap-16">
                {content}
                {/* Two-photo collage: main image + offset inset photo. */}
                <div className={secondaryImage ? "relative sm:pb-10 sm:pl-8" : "relative"}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={backgroundImage}
                    alt={backgroundImageAlt || ""}
                    className="h-64 w-full object-cover sm:h-80"
                    style={{
                      borderRadius: "var(--radius-lg)",
                      boxShadow: "var(--shadow-card)",
                    }}
                  />
                  {secondaryImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={secondaryImage}
                      alt={secondaryImageAlt || ""}
                      className="absolute bottom-0 left-0 hidden w-[45%] object-cover sm:block"
                      style={{
                        aspectRatio: "4 / 3",
                        borderRadius: "var(--radius-lg)",
                        border: "5px solid var(--color-bg)",
                        boxShadow: "var(--shadow-card)",
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              content
            )}
            {items.length > 0 ? (
              <dl
                className="grid grid-cols-2 gap-x-6 gap-y-8 border-t pt-10 lg:grid-cols-4"
                style={{ borderColor: "var(--color-border)" }}
              >
                {items.map((stat, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <dd
                      className="order-first"
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontWeight: "var(--heading-weight)" as CSSProperties["fontWeight"],
                        fontSize: "clamp(1.9rem, 1.4rem + 1.6vw, 2.75rem)",
                        letterSpacing: "-1px",
                        lineHeight: 1.1,
                        color: "var(--color-primary)",
                      }}
                    >
                      {stat.value}
                    </dd>
                    <dt className="text-sm" style={{ color: "var(--color-muted)" }}>
                      {stat.label}
                    </dt>
                  </div>
                ))}
              </dl>
            ) : null}
          </Container>
        </Section>
      );
    }

    /* -------------------------------------------- Centered band */
    return (
      <Section
        background="dark"
        container={false}
        className="relative overflow-hidden"
        style={
          backgroundImage
            ? ({
                backgroundImage: `url(${backgroundImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                "--eyebrow-color": "rgba(248, 250, 252, 0.92)",
              } as CSSProperties)
            : undefined
        }
      >
        {backgroundImage ? (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(10, 14, 20, 0.62)" }}
          />
        ) : null}
        <Container className="section-intro relative flex flex-col items-center gap-6 text-center"
          style={{ maxWidth: "var(--section-content-width, 48rem)" }}>
          <HeroLabel badgeText={badgeText} badgeIcon={badgeIcon} eyebrow={eyebrow} editing={puck.isEditing} />
          <RichHeading level={1} style={backgroundImage ? { color: "#ffffff" } : undefined}>
            {heading}
          </RichHeading>
          <Subheading
            className="max-w-[55ch]"
            style={backgroundImage ? { color: "rgba(255,255,255,0.82)" } : undefined}
          >
            {subheading}
          </Subheading>
          {buttons(true)}
        </Container>
      </Section>
    );
  },
};
