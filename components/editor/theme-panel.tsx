"use client";

import { useState } from "react";
import {
  GOOGLE_FONTS,
  THEME_DEFAULTS,
  type SiteTheme,
} from "@/lib/puck/theme";
import { saveSiteTheme } from "@/app/editor/[pageId]/actions";
import { ImageUploadField } from "@/components/editor/image-upload-field";

const COLOR_LABELS = [
  ["primary", "Primary"],
  ["secondary", "Secondary"],
  ["background", "Background"],
  ["text", "Text"],
] as const;

/**
 * Slide-over panel for the site-wide theme: colors, Google Fonts and the
 * logo. Changes preview live (via Puck metadata) and persist to
 * sites.theme on save.
 */
export function ThemePanel({
  siteId,
  theme,
  onChange,
  open,
  onClose,
}: {
  siteId: string;
  theme: SiteTheme;
  onChange: (theme: SiteTheme) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  function setColor(key: (typeof COLOR_LABELS)[number][0], value: string) {
    onChange({ ...theme, colors: { ...theme.colors, [key]: value } });
  }

  function setFont(key: "heading" | "body", value: string) {
    onChange({ ...theme, fonts: { ...theme.fonts, [key]: value } });
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await saveSiteTheme(siteId, theme);
    setSaving(false);
    setMessage(result.status === "idle" ? null : result.message);
  }

  const selectClasses =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button
        type="button"
        aria-label="Close theme panel"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <aside className="flex h-full w-80 flex-col gap-6 overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Site theme</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Colors
          </h3>
          {COLOR_LABELS.map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              {label}
              <input
                type="color"
                value={theme.colors?.[key] ?? THEME_DEFAULTS.colors[key]}
                onChange={(e) => setColor(key, e.target.value)}
                className="h-8 w-14 cursor-pointer rounded border border-zinc-300"
              />
            </label>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Fonts
          </h3>
          <label className="flex flex-col gap-1.5 text-sm">
            Headings
            <select
              value={theme.fonts?.heading ?? THEME_DEFAULTS.fonts.heading}
              onChange={(e) => setFont("heading", e.target.value)}
              className={selectClasses}
            >
              {GOOGLE_FONTS.map((font) => (
                <option key={font.name} value={font.name}>
                  {font.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Body
            <select
              value={theme.fonts?.body ?? THEME_DEFAULTS.fonts.body}
              onChange={(e) => setFont("body", e.target.value)}
              className={selectClasses}
            >
              {GOOGLE_FONTS.map((font) => (
                <option key={font.name} value={font.name}>
                  {font.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Logo
          </h3>
          <ImageUploadField
            value={theme.logoUrl ?? ""}
            onChange={(logoUrl) => onChange({ ...theme, logoUrl })}
          />
        </section>

        <div className="mt-auto flex flex-col gap-2">
          {message ? <p className="text-xs text-zinc-500">{message}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save theme"}
          </button>
        </div>
      </aside>
    </div>
  );
}
