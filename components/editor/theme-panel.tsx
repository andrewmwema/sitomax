"use client";

import { useRef, useState } from "react";
import {
  COLOR_PALETTES,
  DEFAULT_COLORS,
  STYLE_PRESETS,
  themeFonts,
  type SiteTheme,
  type StyleId,
} from "@/lib/theme/presets";
import {
  CURATED_FONTS,
  FONT_CATEGORIES,
  googleFontsUrl,
  type CuratedFont,
} from "@/lib/theme/fonts";
import { saveSiteTheme } from "@/app/editor/[pageId]/actions";
import { ImageUploadField } from "@/components/editor/image-upload-field";

const COLOR_LABELS = [
  ["primary", "Primary"],
  ["secondary", "Secondary"],
  ["background", "Background"],
  ["text", "Text"],
] as const;

const FONT_PAIRINGS: { label: string; heading: CuratedFont; body: CuratedFont }[] = [
  { label: "Elegant", heading: "Playfair Display", body: "Lato" },
  { label: "Modern", heading: "Plus Jakarta Sans", body: "Inter" },
  { label: "Friendly", heading: "Nunito", body: "Nunito" },
  { label: "Bold", heading: "Bebas Neue", body: "Open Sans" },
  { label: "Editorial", heading: "Lora", body: "Source Sans 3" },
  { label: "Warm", heading: "Fraunces", body: "DM Sans" },
];

function FontPicker({
  label,
  value,
  preset,
  onOpen,
  onChange,
}: {
  label: string;
  value: CuratedFont | undefined;
  preset: CuratedFont;
  onOpen: () => void;
  onChange: (value: CuratedFont | undefined) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);

  function choose(font: CuratedFont | undefined) {
    onChange(font);
    if (details.current) {
      details.current.open = false;
      details.current.querySelector("summary")?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-1 text-sm text-zinc-700">
      <span>{label}</span>
      <details
        ref={details}
        className="relative"
        onToggle={(event) => {
          if (event.currentTarget.open) onOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && details.current?.open) {
            details.current.open = false;
            details.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary
          aria-label={label}
          className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2"
          style={{ fontFamily: `"${value ?? preset}"` }}
        >
          {value ?? `Use preset (${preset})`}
        </summary>
        <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
          <button type="button" onClick={() => choose(undefined)} className="w-full rounded px-2 py-2 text-left hover:bg-zinc-100">
            Use preset ({preset})
          </button>
          {FONT_CATEGORIES.map((category) => (
            <div key={category} role="group" aria-label={category}>
              <p className="px-2 pt-2 text-xs font-semibold text-zinc-500">{category}</p>
              {CURATED_FONTS.filter((font) => font.category === category).map((font) => (
                <button
                  key={font.name}
                  type="button"
                  onClick={() => choose(font.name)}
                  aria-pressed={value === font.name}
                  className="w-full rounded px-2 py-2 text-left hover:bg-zinc-100"
                  style={{ fontFamily: `"${font.name}"` }}
                >
                  {font.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

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
  const [previewFonts, setPreviewFonts] = useState(false);

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
      <aside className="flex h-full w-[min(400px,100vw)] flex-col gap-7 overflow-y-auto border-l border-[#E8E7E3] bg-white p-6 shadow-2xl">
        <link rel="stylesheet" href={googleFontsUrl(themeFonts(theme))} />
        {previewFonts ? (
          <link rel="stylesheet" href={googleFontsUrl(CURATED_FONTS.map((font) => font.name))} />
        ) : null}
        <div className="editor-panel-header flex items-center justify-between">
          <div><p className="platform-eyebrow mb-1">Visual identity</p><h2 className="text-lg font-semibold text-zinc-900">Site theme</h2></div>
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
                          ? '"DM Serif Display", Georgia, serif'
                          : '"Plus Jakarta Sans", system-ui, sans-serif',
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
            Fonts
          </h3>
          {(["headingFont", "bodyFont"] as const).map((field, index) => (
            <FontPicker
              key={field}
              label={field === "headingFont" ? "Heading font" : "Body font"}
              value={theme[field]}
              preset={themeFonts({ style: activeStyle })[index]}
              onOpen={() => setPreviewFonts(true)}
              onChange={(font) => onChange({ ...theme, [field]: font })}
            />
          ))}
          <p className="text-xs text-zinc-500">Suggested pairings</p>
          <div className="grid gap-2">
            {FONT_PAIRINGS.map((pairing) => (
              <button
                key={pairing.label}
                type="button"
                onClick={() => onChange({ ...theme, headingFont: pairing.heading, bodyFont: pairing.body })}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-left text-xs text-zinc-700 hover:border-zinc-400"
              >
                <span className="font-semibold">{pairing.label}:</span> {pairing.heading} + {pairing.body}
              </button>
            ))}
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
            onSelect={(image) => onChange({ ...theme, logoUrl: image.url, logoAlt: image.alt })}
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
