"use client";

import { useState, useTransition } from "react";
import { discardFailedLeadReply, retryLeadReply } from "@/app/(dashboard)/dashboard/forms/reply-actions";

export function LeadReplyActions({ leadId, messageId, stalePending, failed }: {
  leadId: string; messageId: string; stalePending: boolean; failed: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  if (!failed && !stalePending) return null;

  function retry() {
    setProblem("");
    setDone("");
    startTransition(async () => {
      const result = await retryLeadReply({ leadId, messageId });
      if (result.error) setProblem(result.error);
      else setDone(result.success ?? "Reply retried.");
    });
  }

  function discard() {
    setProblem("");
    setDone("");
    startTransition(async () => {
      const result = await discardFailedLeadReply({ leadId, messageId });
      if (result.error) setProblem(result.error);
      else setDone(result.success ?? "Message discarded.");
    });
  }

  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" className="platform-button" disabled={busy} onClick={retry}>Retry</button>
    <button type="button" className="platform-button" disabled={busy} onClick={discard}>Discard failed message</button>
    {problem ? <p role="alert" className="text-xs text-[var(--platform-error)]">{problem}</p> : null}
    {done ? <p role="status" className="text-xs text-[var(--platform-success)]">{done}</p> : null}
  </div>;
}
