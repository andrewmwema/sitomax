"use client";

import { useActionState, useState } from "react";
import { ImageUploadField } from "@/components/editor/image-upload-field";
import { idleState, type ActionState } from "@/lib/form-state";
import type { AgencySettings } from "@/lib/agency";
import { brand } from "@/lib/brand";

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
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? "");

  return (
    <form
      action={formAction}
      className="platform-panel flex max-w-xl flex-col gap-5 p-6 sm:p-8"
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
        <ImageUploadField agency value={logoUrl} onChange={setLogoUrl} readOnly={pending} initialQuery={settings.name} />
        <input type="hidden" name="logo_url" value={logoUrl} />
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
          placeholder={brand.supportEmail}
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
