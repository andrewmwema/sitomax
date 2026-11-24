"use client";

import { useId, useRef } from "react";
import { EnquiryForm, enquiryFields, type EnquiryField } from "./enquiry-form";

export function FormPopupButton({
  label,
  formName,
  submitText,
  fields = enquiryFields,
  variant = "primary",
}: {
  label: string;
  formName: string;
  submitText?: string;
  fields?: EnquiryField[];
  variant?: "primary" | "secondary";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        data-analytics-event="cta_click"
        className="site-button inline-flex min-h-12 items-center justify-center gap-2 px-6 py-3 text-center text-base font-semibold whitespace-normal no-underline transition hover:-translate-y-px hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          borderRadius: "var(--button-radius, var(--radius-sm))",
          fontFamily: "var(--font-body)",
          outlineColor: "currentColor",
          ...(variant === "primary"
            ? {
                backgroundColor: "var(--btn-bg, var(--color-primary))",
                color: "var(--btn-fg, var(--color-on-primary))",
                border: "1px solid transparent",
              }
            : {
                backgroundColor: "transparent",
                color: "inherit",
                border: "1px solid currentColor",
              }),
        }}
      >
        {label}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="site-form-dialog m-auto max-h-[85dvh] max-w-[34rem] overflow-y-auto border-0 bg-transparent p-0"
        style={{ width: "min(34rem, calc(100vw - 2rem))" }}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div
          className="relative flex flex-col gap-5 p-6 sm:p-8"
          style={{
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg)",
            color: "var(--color-text)",
            boxShadow: "var(--shadow-medium)",
          }}
        >
          <button
            type="button"
            aria-label="Close enquiry form"
            onClick={() => dialogRef.current?.close()}
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full text-xl leading-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            ×
          </button>
          <h2 id={titleId} className="pr-10 text-xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
            Tell us a little about your project
          </h2>
          <EnquiryForm formName={formName} submitText={submitText ?? "Send enquiry"} fields={fields} />
        </div>
      </dialog>
    </>
  );
}
