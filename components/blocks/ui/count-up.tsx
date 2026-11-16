"use client";

import { useEffect, useRef, useState } from "react";

/** Splits "1,250+" into prefix "", number 1250, suffix "+". */
function parseStat(value: string) {
  const match = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(value);
  if (!match) return null;
  const raw = match[2];
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return {
    prefix: match[1],
    target: Number(raw.replace(/,/g, "")),
    decimals,
    grouped: raw.includes(","),
    suffix: match[3],
  };
}

/**
 * Animates the numeric part of a stat once it scrolls into view. The
 * server (and reduced-motion visitors) see the final value.
 */
export function CountUp({ value, durationMs = 1600 }: { value: string; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const parsed = parseStat(value);
  const [display, setDisplay] = useState<string>(value);

  useEffect(() => {
    const element = ref.current;
    if (!element || !parsed || !Number.isFinite(parsed.target)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    const format = (n: number) =>
      parsed.prefix +
      n.toLocaleString("en-US", {
        minimumFractionDigits: parsed.decimals,
        maximumFractionDigits: parsed.decimals,
        useGrouping: parsed.grouped,
      }) +
      parsed.suffix;

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const step = (time: number) => {
          const t = Math.min(1, (time - start) / durationMs);
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplay(format(parsed.target * eased));
          if (t < 1) frame = requestAnimationFrame(step);
        };
        setDisplay(format(0));
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      setDisplay(value);
    };
    // parsed is derived from value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return (
    <span ref={ref} className="tabular-nums">
      {display}
    </span>
  );
}
