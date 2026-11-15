"use client";

import { useActionState } from "react";
import { idleState, type ActionState } from "@/lib/form-state";

export function CreateAccountForm({
  action,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-zinc-900">New client</h2>
      <form action={formAction} className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          name="name"
          required
          placeholder="Client or business name"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create account"}
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
