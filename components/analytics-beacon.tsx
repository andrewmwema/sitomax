"use client";

import { useEffect, useRef } from "react";

export function AnalyticsBeacon() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    let referrer = "";
    try {
      if (document.referrer) referrer = new URL(document.referrer).origin;
    } catch {
      // Invalid referrers are not useful for reporting.
    }
    const body = JSON.stringify({ path: window.location.pathname, referrer });
    navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
  }, []);
  return null;
}
