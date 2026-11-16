"use client";

import { preconnect } from "react-dom";

export function TenantFontHints() {
  preconnect("https://fonts.googleapis.com");
  preconnect("https://fonts.gstatic.com", { crossOrigin: "anonymous" });
  return null;
}
