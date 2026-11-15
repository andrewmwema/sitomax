"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInWithPassword, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

const inputClasses =
  "rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

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
          className={inputClasses}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Password
          </span>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className={inputClasses}
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
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
