"use client";

import { useActionState, useState } from "react";
import { PenLine } from "lucide-react";
import { saveEmailSignature } from "@/app/(dashboard)/dashboard/settings/actions";
import { idleState } from "@/lib/form-state";
import { LEAD_SIGNATURE_MAX, leadSignatureVariables } from "@/lib/leads/reply-content";

export function EmailSignatureForm({ signature }: { signature: string }) {
  const [state, action, pending] = useActionState(saveEmailSignature, idleState);
  const [value, setValue] = useState(signature);
  return <section id="email-signature" className="platform-panel scroll-mt-5 p-5 sm:p-6">
    <div className="mb-5 flex items-center gap-3">
      <span className="rounded-lg border border-[var(--platform-line)] p-2 text-[var(--platform-muted)]"><PenLine size={17} /></span>
      <div><h2 className="text-[15px] font-semibold">Email signature</h2>
        <p className="mt-1 text-xs text-[var(--platform-muted)]">Added under your replies to leads. You can still edit it in each reply.</p></div>
    </div>
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm font-medium">Signature
        <textarea name="signature" value={value} onChange={(event) => setValue(event.target.value)} rows={5} maxLength={LEAD_SIGNATURE_MAX}
          placeholder={"{name}\n{business_name}\n{phone}\n{website}"} className="rounded-lg border px-3 py-2 text-sm font-normal" />
      </label>
      <p className="text-xs leading-relaxed text-[var(--platform-muted)]">
        Leave it empty to use your name with each website&apos;s business name, phone number and web address.
        {" "}Variables: {leadSignatureVariables.map((name) => `{${name}}`).join(", ")}. A line whose variables are all empty is left out.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || value === signature} className="platform-button platform-button-primary">{pending ? "Saving..." : "Save signature"}</button>
        {value ? <button type="button" disabled={pending} onClick={() => setValue("")} className="platform-button">Use the default</button> : null}
        <span aria-live="polite" className="text-xs">
          {state.status === "error" ? <span role="alert" className="text-[var(--platform-error)]">{state.message}</span>
            : state.status === "success" && value === signature ? <span className="text-[var(--platform-success)]">{state.message}</span> : null}
        </span>
      </div>
    </form>
  </section>;
}
