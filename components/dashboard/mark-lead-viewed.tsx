"use client";

import { useEffect, useState } from "react";
import { markLeadViewed } from "@/app/(dashboard)/dashboard/forms/actions";

export function MarkLeadViewed({ id, lastActivity }: { id: string; lastActivity: string }) {
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    markLeadViewed({ id, lastActivity }).then((result) => {
      if (active && result.error) setError(result.error);
    }).catch(() => {
      if (active) setError("Could not mark this lead as read. Refresh and try again.");
    });
    return () => { active = false; };
  }, [id, lastActivity]);
  return error ? <p role="alert" className="text-sm text-[var(--platform-error)]">{error}</p> : null;
}
