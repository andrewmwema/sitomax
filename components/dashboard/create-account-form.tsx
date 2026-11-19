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
    <div>
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">Client or business name
        <input
          type="text"
          name="name"
          required
          maxLength={100}
          placeholder="Client or business name"
          className="w-full border px-3.5 py-2.5 text-sm font-normal"
        />
        </label>
        <p className="text-xs leading-relaxed text-[var(--platform-muted)]">Create the account first, then open its details to invite an owner and assign websites.</p>
        <button
          type="submit"
          disabled={pending}
          className="platform-button platform-button-primary self-start"
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
        <p role="status" className="mt-3 text-sm text-[var(--platform-success)]">{state.message}</p>
      )}
    </div>
  );
}
