"use client";

import { useActionState } from "react";
import { idleState, type ActionState } from "@/lib/form-state";
import type { AgencySettings } from "@/lib/agency";

const inputClasses =
  "rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none";

export function AgencySettingsForm({
  settings,
  action,
}: {
  settings: AgencySettings;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);

  return (
    <form
      action={formAction}
      className="flex max-w-xl flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Agency name</span>
        <input
          type="text"
          name="name"
          required
          defaultValue={settings.name}
          className={inputClasses}
        />
        <span className="text-xs text-zinc-500">
          Shown to clients on the login page and the dashboard.
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Logo</span>
        <div className="flex items-center gap-4">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote logo host is user-configured
            <img
              src={settings.logoUrl}
              alt="Current logo"
              className="size-12 rounded-lg border border-zinc-200 object-contain p-1"
            />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400">
              None
            </div>
          )}
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
          />
        </div>
        <span className="text-xs text-zinc-500">
          PNG, JPEG, SVG or WebP, up to 2 MB.
        </span>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Primary color
        </span>
        <input
          type="color"
          name="primary_color"
          defaultValue={settings.primaryColor}
          className="h-11 w-20 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
        />
        <span className="text-xs text-zinc-500">
          Used for buttons and accents across the dashboard and login page.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Support email
        </span>
        <input
          type="email"
          name="support_email"
          defaultValue={settings.supportEmail ?? ""}
          placeholder="support@youragency.com"
          className={inputClasses}
        />
      </label>

      {state.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p className="text-sm text-emerald-600">{state.message}</p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
