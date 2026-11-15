"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    sendPasswordReset,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <svg
            className="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <p className="font-medium text-zinc-900 dark:text-zinc-100">
          Check your email
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          If an account exists for{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {state.email}
          </span>
          , a password reset link is on its way.
        </p>
        <Link
          href="/login"
          className="mt-1 text-sm font-medium text-primary hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Email address
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>

      {state.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
