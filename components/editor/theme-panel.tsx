"use client";

import { useState } from "react";
import {
  COLOR_PALETTES,
  DEFAULT_COLORS,
  STYLE_PRESETS,
  type SiteTheme,
  type StyleId,
} from "@/lib/theme/presets";
import { saveSiteTheme } from "@/app/editor/[pageId]/actions";
import { ImageUploadField } from "@/components/editor/image-upload-field";

const COLOR_LABELS = [
  ["primary", "Primary"],
  ["secondary", "Secondary"],
  ["background", "Background"],
  ["text", "Text"],
] as const;

/**
 * Slide-over panel for the site-wide theme: style preset (Classic or
 * Modern), color palette and logo. Changes preview live (via Puck
 * metadata) and persist to sites.theme on save.
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

  const colors = { ...DEFAULT_COLORS, ...theme.colors };
  const activeStyle: StyleId = theme.style ?? "classic";
  const activePalette = COLOR_PALETTES.find(
    (palette) =>
      palette.colors.primary === colors.primary &&
      palette.colors.secondary === colors.secondary &&
      palette.colors.background === colors.background &&
      palette.colors.text === colors.text,
  );

  function setColor(key: (typeof COLOR_LABELS)[number][0], value: string) {
    onChange({ ...theme, colors: { ...theme.colors, [key]: value } });
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await saveSiteTheme(siteId, theme);
    setSaving(false);
    setMessage(result.status === "idle" ? null : result.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button
        type="button"
        aria-label="Close theme panel"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <aside className="flex h-full w-85 flex-col gap-7 overflow-y-auto bg-white p-6 shadow-2xl">
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
            Style
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STYLE_PRESETS) as StyleId[]).map((styleId) => {
              const preset = STYLE_PRESETS[styleId];
              const active = activeStyle === styleId;
              return (
                <button
                  key={styleId}
                  type="button"
                  onClick={() => onChange({ ...theme, style: styleId })}
                  className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition ${
                    active
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  <span
                    className="text-base"
                    style={{
                      fontFamily:
                        styleId === "classic"
                          ? "var(--font-dm-serif), Georgia, serif"
                          : "var(--font-jakarta), system-ui, sans-serif",
                      fontWeight: styleId === "classic" ? 400 : 800,
                    }}
                  >
                    {preset.label}
                  </span>
                  <span
                    className={`text-[11px] leading-snug ${active ? "text-zinc-300" : "text-zinc-500"}`}
                  >
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Color palette
          </h3>
          <div className="flex flex-col gap-2">
            {COLOR_PALETTES.map((palette) => {
              const active = activePalette?.id === palette.id;
              return (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => onChange({ ...theme, colors: { ...palette.colors } })}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition ${
                    active
                      ? "border-zinc-900 ring-1 ring-zinc-900"
                      : "border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  <span className="text-sm font-medium text-zinc-800">{palette.label}</span>
                  <span className="flex items-center gap-1">
                    {[palette.colors.primary, palette.colors.secondary, palette.colors.text].map(
                      (swatch, i) => (
                        <span
                          key={i}
                          className="size-5 rounded-full border border-black/10"
                          style={{ backgroundColor: swatch }}
                        />
                      ),
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Custom colors
          </h3>
          {COLOR_LABELS.map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              {label}
              <input
                type="color"
                value={colors[key]}
                onChange={(e) => setColor(key, e.target.value)}
                className="h-8 w-14 cursor-pointer rounded border border-zinc-300"
              />
            </label>
          ))}
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
