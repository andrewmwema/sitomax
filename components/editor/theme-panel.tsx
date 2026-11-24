"use client";

import { useRef, useState } from "react";
import {
  COLOR_PALETTES,
  DEFAULT_COLORS,
  STYLE_PRESETS,
  THEME_PRESETS,
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
import {
  applyQuickStyle,
  BUTTON_STYLES,
  CORNER_PRESETS,
  FONT_PAIRINGS,
  applyThemePreset,
  matchesThemePreset,
  SPACING_PRESETS,
} from "@/lib/theme/quick-styles";
import { saveSiteTheme } from "@/app/editor/[pageId]/actions";
import { ImageUploadField } from "@/components/editor/image-upload-field";
import { WorkspaceDialog } from "@/components/dashboard/workspace-dialog";
import { HexColorInput } from "./hex-color-input";

const COLOR_LABELS = [
  ["primary", "Primary"],
  ["secondary", "Secondary"],
  ["background", "Background"],
  ["text", "Text"],
] as const;

/** One-click choices: each applies a ready-made preset to the theme at once, with no AI involved. */
function QuickChoices<T extends string>({ label, options, active, onChoose }: {
  label: string;
  options: readonly { id: T; label: string; description?: string }[];
  active: T | undefined;
  onChoose: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.description}
          aria-pressed={active === option.id}
          onClick={() => onChoose(option.id)}
          className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
            active === option.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

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
 * Modern), fonts, color palette, button shape, corners, section spacing,
 * logo and favicon. Theme changes preview live (via Puck metadata) and
 * persist to sites.theme on save. The presets here are the same ones the AI
 * agent applies with apply_theme_preset, so a simple request needs no AI.
 */
export function ThemePanel({
  siteId,
  theme,
  onChange,
  open,
  onClose,
  saveOverride,
}: {
  siteId: string;
  theme: SiteTheme;
  onChange: (theme: SiteTheme) => void;
  open: boolean;
  onClose: () => void;
  saveOverride?: (theme: SiteTheme) => ReturnType<typeof saveSiteTheme>;
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
    const result = await (saveOverride ? saveOverride(theme) : saveSiteTheme(siteId, theme));
    setSaving(false);
    setMessage(result.status === "idle" ? null : result.message);
  }

  return (
    <WorkspaceDialog title="Site theme" description="Your site's visual identity. Preview changes live, then save your theme." open={open} onClose={onClose}>
        <link rel="stylesheet" href={googleFontsUrl(themeFonts(theme))} />
        {previewFonts ? (
          <link rel="stylesheet" href={googleFontsUrl(CURATED_FONTS.map((font) => font.name))} />
        ) : null}
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Curated themes
          </h3>
          <p className="text-xs text-zinc-500">Apply a complete visual direction, then customize any detail below.</p>
          <div className="grid grid-cols-2 gap-2">
            {THEME_PRESETS.map((preset) => {
              const active = matchesThemePreset(theme, preset.id);
              const swatches = [
                preset.theme.colors?.primary,
                preset.theme.colors?.secondary,
                preset.theme.colors?.background,
                preset.theme.colors?.accent,
              ];
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.description}
                  aria-pressed={active}
                  onClick={() => onChange(applyThemePreset(theme, preset.id))}
                  className={`flex min-w-0 flex-col gap-2 rounded-lg border p-2.5 text-left transition ${
                    active
                      ? "border-zinc-900 ring-1 ring-zinc-900"
                      : "border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  <span className="flex items-center gap-1" aria-hidden="true">
                    {swatches.map((color, index) => (
                      <span
                        key={`${preset.id}-${index}`}
                        className="size-4 rounded-full border border-black/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <span className="text-xs font-semibold text-zinc-800">{preset.label}</span>
                  <span className="text-[10px] leading-snug text-zinc-500">{preset.description}</span>
                </button>
              );
            })}
          </div>
        </section>
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
                key={pairing.id}
                type="button"
                aria-pressed={theme.headingFont === pairing.heading && theme.bodyFont === pairing.body}
                onClick={() => onChange(applyQuickStyle(theme, { fonts: pairing.id }))}
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
                  onClick={() => onChange(applyQuickStyle(theme, { palette: palette.id }))}
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
            Buttons, corners and spacing
          </h3>
          <p className="text-xs text-zinc-500">One click changes the whole site. No AI credits are used.</p>
          <span className="text-sm text-zinc-700">Button shape</span>
          <QuickChoices label="Button shape" options={BUTTON_STYLES} active={theme.buttonStyle}
            onChoose={(buttons) => onChange(applyQuickStyle(theme, { buttons }))} />
          <span className="text-sm text-zinc-700">Corners</span>
          <QuickChoices label="Corners" options={CORNER_PRESETS} active={CORNER_PRESETS.find((preset) => preset.radius === theme.radius)?.id}
            onChoose={(corners) => onChange(applyQuickStyle(theme, { corners }))} />
          <span className="text-sm text-zinc-700">Space between sections</span>
          <QuickChoices label="Space between sections" options={SPACING_PRESETS} active={theme.spacing ?? "comfortable"}
            onChoose={(spacing) => onChange(applyQuickStyle(theme, { spacing }))} />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Custom colors
          </h3>
          <p className="text-xs text-zinc-500">Enter a hex color and press Enter or leave the field to apply it.</p>
          {COLOR_LABELS.map(([key, label]) => (
            <div key={key} className="flex items-start justify-between gap-3 text-sm">
              <span>{label}</span>
              <div className="flex items-start gap-2">
              <input
                type="color"
                aria-label={`${label} color`}
                value={colors[key]}
                onChange={(e) => setColor(key, e.target.value)}
                className="h-8 w-14 cursor-pointer rounded border border-zinc-300"
              />
              <HexColorInput label={`${label} color`} value={colors[key]} onChange={(value) => setColor(key, value)} />
              </div>
            </div>
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

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Browser favicon
          </h3>
          <p className="text-xs text-zinc-500">The small icon shown in browser tabs. PNG, JPEG, SVG or WebP.</p>
          <ImageUploadField
            value={theme.faviconUrl ?? ""}
            onChange={(faviconUrl) => onChange({ ...theme, faviconUrl })}
            imageClassName="size-16 rounded-lg border border-[#E8E7E3] object-contain"
          />
        </section>

        <div className="mt-auto flex flex-col gap-2">
          {message ? <p role="status" className="text-xs text-zinc-500">{message}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="platform-button platform-button-primary"
          >
            {saving ? "Saving…" : "Save theme"}
          </button>
        </div>
    </WorkspaceDialog>
  );
}
