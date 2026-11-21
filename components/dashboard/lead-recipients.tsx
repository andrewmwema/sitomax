"use client";

import { useState } from "react";
import { z } from "zod";
import { LeadSettingsForm } from "./lead-settings-form";

export function LeadRecipients({ siteId, initial }: { siteId: string; initial: string[] }) {
  const [recipients, setRecipients] = useState(initial);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  function add() {
    const email = address.trim().toLowerCase();
    if (!z.email().max(254).safeParse(email).success) return setError("Enter a valid email address.");
    if (recipients.some((recipient) => recipient.toLowerCase() === email)) return setError("This email address is already listed.");
    if (recipients.length >= 25) return setError("You can add up to 25 recipients.");
    setRecipients([...recipients, email]);
    setAddress("");
    setError("");
  }
  return <LeadSettingsForm siteId={siteId} intent="recipients" disabled={Boolean(address.trim())}>
    {recipients.length ? <ul className="space-y-2">{recipients.map((recipient) => <li key={recipient} className="flex items-center justify-between gap-2 text-sm">
      <span className="break-all">{recipient}</span>
      <button type="button" className="platform-button" aria-label={`Remove ${recipient}`} onClick={() => setRecipients(recipients.filter((item) => item !== recipient))}>Remove</button>
    </li>)}</ul> : <p className="text-sm text-[var(--platform-muted)]">Using account owners by default.</p>}
    <input type="hidden" name="recipients" value={recipients.join("\n")} />
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-48 flex-1 text-sm">Add email address
        <input type="email" maxLength={254} value={address} onChange={(event) => { setAddress(event.target.value); setError(""); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }}
          className="mt-1 block w-full rounded-lg border p-2 text-sm" />
      </label>
      <button type="button" className="platform-button" onClick={add}>Add recipient</button>
    </div>
    {error ? <p role="alert" className="text-sm text-[var(--platform-error)]">{error}</p> : null}
    {address.trim() ? <p className="text-xs text-[var(--platform-muted)]">Add this address to the list before saving.</p> : null}
  </LeadSettingsForm>;
}
