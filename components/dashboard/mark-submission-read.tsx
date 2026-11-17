"use client";

import { useActionState } from "react";
import { markSubmissionRead } from "@/app/(dashboard)/dashboard/forms/actions";

export function MarkSubmissionRead({ id }: { id: string }) {
  const [state, action, pending] = useActionState(markSubmissionRead, { error: "" });
  return <form action={action}>
    <input type="hidden" name="id" value={id} />
    <button disabled={pending} className="text-sm font-medium text-[#4B3FE0] hover:underline disabled:opacity-50">{pending ? "Saving..." : "Mark as read"}</button>
    {state.error ? <p role="alert" className="text-xs text-red-700">{state.error}</p> : null}
  </form>;
}
