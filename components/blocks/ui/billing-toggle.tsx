"use client";

import { useState, type ReactNode } from "react";

export function BillingToggle({ monthly, yearly }: { monthly: ReactNode; yearly: ReactNode }) {
  const [annual, setAnnual] = useState(false);

  return (
    <div>
      <div className="mb-9 flex justify-center">
        <div
          role="group"
          aria-label="Billing period"
          className="inline-flex max-w-full gap-1 border p-1"
          style={{ backgroundColor: "var(--color-soft-bg)", borderColor: "var(--color-border)", borderRadius: "var(--radius-lg)" }}
        >
          {(["Monthly", "Yearly"] as const).map((label, index) => {
            const active = annual === (index === 1);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => setAnnual(index === 1)}
                className="min-h-12 cursor-pointer px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4"
                style={{
                  backgroundColor: active ? "var(--color-primary)" : "transparent",
                  color: active ? "var(--color-on-primary)" : "var(--color-text)",
                  borderRadius: "var(--radius-sm)",
                  outlineColor: "var(--color-primary)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {annual ? yearly : monthly}
    </div>
  );
}
