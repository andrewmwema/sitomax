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
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="accountId" value={accountId} />
        <input
          type="email"
          name="email"
          required
          placeholder="owner@client.com"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
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
        <p className="mt-2 text-sm text-emerald-600">{state.message}</p>
      )}
    </div>
  );
}
