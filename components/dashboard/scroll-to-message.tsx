"use client";

import { useEffect } from "react";

export function ScrollToMessage({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(`message-${id}`)?.scrollIntoView({ block: "start" });
  }, [id]);
  return null;
}
