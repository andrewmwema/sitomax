"use client";

import { useActionState } from "react";
import { idleState, type ActionState } from "@/lib/form-state";

export function InviteOwnerForm({
  accountId,
  action,
}: {
  accountId: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);

  return (
    <div>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="accountId" value={accountId} />
        <label className="flex flex-col gap-2 text-xs font-medium text-[var(--platform-secondary)]">Owner email
        <input
          type="email"
          name="email"
          required
          placeholder="owner@client.com"
          className="w-full border px-3 py-2 text-sm font-normal"
        />
        </label>
        <p className="text-xs leading-relaxed text-[var(--platform-muted)]">Role: <strong className="font-medium">Owner</strong>. Owners can manage websites, domains, submissions and team access. Existing users are added directly; new users receive an email invitation.</p>
        <button
          type="submit"
          disabled={pending}
          className="platform-button platform-button-primary self-start"
        >
          {pending ? "Inviting…" : "Invite owner"}
        </button>
      </form>
      {state.status === "error" && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="mt-2 text-sm text-[var(--platform-success)]">{state.message}</p>
      )}
    </div>
  );
}
