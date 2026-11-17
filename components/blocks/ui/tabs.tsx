"use client";

import { useId, useRef, useState, type ReactNode } from "react";

/** Automatic-activation tabs with roving keyboard focus. */
export function Tabs({
  label,
  items,
  vertical = false,
}: {
  label: string;
  items: { label: string; content: ReactNode }[];
  vertical?: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const active = Math.min(selected, Math.max(0, items.length - 1));

  function activate(index: number) {
    setSelected(index);
    buttons.current[index]?.focus();
  }

  return (
    <div className={`min-w-0 ${vertical ? "md:grid md:grid-cols-[minmax(12rem,1fr)_2fr] md:gap-10" : ""}`}>
      <div
        role="tablist"
        aria-label={label}
        className={`flex flex-wrap gap-2 border-b pb-5 ${vertical ? "md:flex-col md:flex-nowrap md:border-b-0 md:border-r md:pb-0 md:pr-5" : ""}`}
        style={{ borderColor: "var(--color-border)" }}
      >
        {items.map((item, index) => (
          <button
            key={index}
            ref={(node) => { buttons.current[index] = node; }}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              const next = {
                ArrowRight: (index + 1) % items.length,
                ArrowLeft: (index - 1 + items.length) % items.length,
                ...(vertical ? {
                  ArrowDown: (index + 1) % items.length,
                  ArrowUp: (index - 1 + items.length) % items.length,
                } : {}),
                Home: 0,
                End: items.length - 1,
              }[event.key];
              if (next !== undefined) {
                event.preventDefault();
                activate(next);
              }
            }}
            className="min-h-12 min-w-0 cursor-pointer px-5 py-3 text-left text-sm font-semibold wrap-anywhere transition-colors focus-visible:outline-2 focus-visible:outline-offset-4"
            style={{
              borderRadius: "var(--radius-sm)",
              backgroundColor: active === index ? "var(--color-primary)" : "var(--color-soft-bg)",
              color: active === index ? "var(--color-on-primary)" : "var(--color-text)",
              outlineColor: "var(--color-primary)",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={index}
          id={`${id}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
          tabIndex={0}
          hidden={active !== index}
          className={`pt-8 focus-visible:outline-2 focus-visible:outline-offset-4 ${vertical ? "md:pt-0" : ""}`}
          style={{ outlineColor: "var(--color-primary)" }}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
