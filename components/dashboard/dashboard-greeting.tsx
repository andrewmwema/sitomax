"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}

export function DashboardGreeting({ displayName }: { displayName: string }) {
  const minute = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 60_000), () => null);
  const now = minute === null ? null : new Date(minute * 60_000);
  const hour = now?.getHours() ?? 0;
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return <div>
    <p className="platform-eyebrow">{now ? new Intl.DateTimeFormat("en", {
      weekday: "long", month: "long", day: "numeric",
    }).format(now) : "\u00a0"}</p>
    <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-[-0.7px]">
      {now ? `Good ${greeting}` : "Welcome"}, {displayName}
    </h1>
    <p className="mt-2 text-[13px] text-[#6B6A66]">A clear view of your websites and what needs attention.</p>
  </div>;
}
