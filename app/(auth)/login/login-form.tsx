"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { signInWithPassword, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };
const subscribeToHash = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};

const inputClasses =
  "rounded-[10px] border border-[#E8E7E3] bg-white px-3.5 py-2.5 text-sm text-[#121212] placeholder:text-[#A8A7A2] focus:border-[#4B3FE0] focus:ring-2 focus:ring-[#4B3FE0]/20 focus:outline-none";

export function LoginForm({ next }: { next: string }) {
  // Fragments survive the login redirect in the browser, but never reach the server.
  const replyRequested = useSyncExternalStore(subscribeToHash, () => window.location.hash === "#reply", () => false);
  const destination = replyRequested && /^\/dashboard\/leads\/[0-9a-f-]{36}$/i.test(next) ? `${next}#reply` : next;
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={destination} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[#3D3C39]">
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
          <span className="text-sm font-medium text-[#3D3C39]">
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
