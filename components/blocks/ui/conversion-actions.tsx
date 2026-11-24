import type { LinkValue } from "@/lib/links";
import type { EnquiryField } from "./enquiry-form";
import { Button } from "./button";
import { FormPopupButton } from "./form-popup-button";

export type ConversionAction = {
  label: string;
  mode?: "link" | "form-popup";
  link?: LinkValue;
  formName?: string;
};

export function ConversionActions({
  primary,
  secondary,
  trustLine,
  fields,
  center = false,
  className = "",
}: {
  primary?: ConversionAction;
  secondary?: ConversionAction;
  trustLine?: string;
  fields?: EnquiryField[];
  center?: boolean;
  className?: string;
}) {
  if (!primary?.label && !secondary?.label && !trustLine) return null;

  return (
    <div className={`flex w-full flex-col gap-3 pt-1 min-[480px]:w-auto ${className}`}>
      {primary?.label || secondary?.label ? (
        <div className={`flex w-full flex-col gap-3 min-[480px]:w-auto min-[480px]:flex-row min-[480px]:flex-wrap ${center ? "min-[480px]:justify-center" : ""}`}>
          {primary?.label ? (
            primary.mode === "form-popup" ? (
              <FormPopupButton
                label={primary.label}
                formName={primary.formName || "project-enquiry"}
                submitText={primary.label}
                fields={fields}
              />
            ) : (
              <Button href={primary.link}>{primary.label}</Button>
            )
          ) : null}
          {secondary?.label ? (
            secondary.mode === "form-popup" ? (
              <FormPopupButton
                label={secondary.label}
                formName={secondary.formName || "project-enquiry"}
                submitText={secondary.label}
                fields={fields}
                variant="secondary"
              />
            ) : (
              <Button href={secondary.link} variant="secondary">{secondary.label}</Button>
            )
          ) : null}
        </div>
      ) : null}
      {trustLine ? (
        <p className={`text-sm leading-6 ${center ? "min-[480px]:text-center" : ""}`} style={{ color: "var(--color-muted)" }}>
          {trustLine}
        </p>
      ) : null}
    </div>
  );
}
