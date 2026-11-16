"use client";

import { useId, useRef, useState, type ReactNode } from "react";

export function Carousel({ items, label }: { items: ReactNode[]; label: string }) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function goTo(next: number) {
    const node = track.current;
    const slide = node?.children[Math.max(0, Math.min(next, items.length - 1))];
    if (node && slide instanceof HTMLElement) {
      node.scrollTo({ left: slide.offsetLeft });
    }
  }

  if (!items.length) return null;
  const activeIndex = Math.min(index, items.length - 1);

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      <div
        id={id}
        ref={track}
        tabIndex={0}
        className="relative flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth rounded-[var(--radius-lg)] motion-reduce:scroll-auto focus-visible:outline-2 focus-visible:outline-offset-4"
        onScroll={() => {
          const node = track.current;
          if (node?.clientWidth) setIndex(Math.max(0, Math.round(node.scrollLeft / node.clientWidth)));
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const next = { ArrowRight: activeIndex + 1, ArrowLeft: activeIndex - 1, Home: 0, End: items.length - 1 }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            goTo(next);
          }
        }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            className="w-full min-w-0 shrink-0 snap-start"
          >
            {item}
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between gap-4">
        <p aria-live="polite" aria-atomic="true" className="text-sm" style={{ color: "var(--color-muted)" }}>
          {activeIndex + 1} / {items.length}
        </p>
        <div className="flex gap-2">
          {[{ text: "Previous", next: activeIndex - 1, disabled: activeIndex === 0 }, { text: "Next", next: activeIndex + 1, disabled: activeIndex >= items.length - 1 }].map((control) => (
            <button
              key={control.text}
              type="button"
              aria-controls={id}
              aria-label={`${control.text} testimonial`}
              disabled={control.disabled}
              onClick={() => goTo(control.next)}
              className="min-h-12 min-w-12 rounded-[var(--radius-sm)] border px-5 text-sm font-semibold transition hover:bg-[var(--color-soft-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: "var(--color-border)" }}
            >
              {control.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
