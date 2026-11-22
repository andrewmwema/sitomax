"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function LocalTime({ value }: { value: string }) {
  const ready = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const date = new Date(value);
  if (!ready || Number.isNaN(date.getTime())) return <time dateTime={value} title={value}>{value}</time>;
  return <time dateTime={value} title={date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" })}>
    {date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
  </time>;
}
