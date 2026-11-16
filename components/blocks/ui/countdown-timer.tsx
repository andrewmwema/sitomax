"use client";

import { useEffect, useState, type CSSProperties } from "react";

const UNITS = [
  { label: "Days", ms: 86_400_000 },
  { label: "Hours", ms: 3_600_000 },
  { label: "Minutes", ms: 60_000 },
  { label: "Seconds", ms: 1000 },
] as const;

function splitDuration(ms: number): number[] {
  let rest = ms;
  return UNITS.map((unit) => {
    const value = Math.floor(rest / unit.ms);
    rest -= value * unit.ms;
    return value;
  });
}

/**
 * Live countdown to an ISO date. Renders "--" until mounted so server and
 * client markup match (the remaining time depends on the visitor's clock).
 */
export function CountdownTimer({
  endsAt,
  endMessage,
  tileStyle,
  numberStyle,
}: {
  endsAt: string;
  endMessage: string;
  tileStyle?: CSSProperties;
  numberStyle?: CSSProperties;
}) {
  const target = Date.parse(endsAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = now === null || Number.isNaN(target) ? null : Math.max(0, target - now);

  if (remaining === 0 && endMessage) {
    return (
      <p className="m-0 font-semibold" style={numberStyle} role="status">
        {endMessage}
      </p>
    );
  }

  const parts = splitDuration(remaining ?? 0);
  return (
    <div className="flex flex-wrap gap-3" role="timer" aria-live="off">
      {UNITS.map((unit, i) => {
        const value = parts[i];
        return (
          <div
            key={unit.label}
            className="flex min-w-20 flex-col items-center px-3 py-3"
            style={tileStyle}
          >
            <span className="font-bold tabular-nums" style={numberStyle}>
              {remaining === null ? "--" : String(value).padStart(2, "0")}
            </span>
            <span className="text-xs font-medium tracking-wide uppercase opacity-75">
              {unit.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
