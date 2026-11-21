"use client";

import { useContext } from "react";
import { DEFAULT_COLORS } from "@/lib/theme/presets";
import {
  CUSTOM_FONT_SIZE_MAX,
  CUSTOM_FONT_SIZE_MIN,
  THEME_COLOR_TOKENS,
  TYPE_SCALE,
  TYPE_TOKENS,
  isThemeColorToken,
  type ColorChoice,
  type ThemeColorToken,
  type TypeSize,
} from "@/lib/layout/guardrails";
import { safeHexColor } from "@/lib/sections/design";
import {
  ROW_LAYOUTS,
  ROW_LAYOUT_IDS,
  safeRowLayout,
  type RowLayout,
} from "@/lib/layout/structure";
import { SectionLibraryContext } from "@/components/editor/section-library";
import { HexColorInput } from "./hex-color-input";

/**
 * Sidebar controls behind the layout-system guardrails: theme-palette
 * colors, the type scale (with a bounded "custom" size) and the
 * countdown date. Only tokens or validated values are ever stored.
 */

const controlClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs disabled:opacity-60";

/** Theme palette swatches (stored as tokens), plus an optional custom hex. */
export function ThemeColorControl({
  value,
  onChange,
  readOnly,
  allowAuto = true,
}: {
  value: ColorChoice | undefined;
  onChange: (value: ColorChoice) => void;
  readOnly?: boolean;
  allowAuto?: boolean;
}) {
  const library = useContext(SectionLibraryContext);
  const colors = { ...DEFAULT_COLORS, ...library?.theme.colors };
  // Editor-side previews of the theme variables (mirrors buildThemeStyle).
  const preview: Record<ThemeColorToken, string> = {
    primary: colors.primary,
    secondary: colors.secondary,
    text: colors.text,
    muted: `color-mix(in srgb, ${colors.text} 64%, ${colors.background})`,
    background: colors.background,
    soft: `color-mix(in srgb, ${colors.primary} 6%, ${colors.background})`,
    border: `color-mix(in srgb, ${colors.text} 14%, ${colors.background})`,
  };
  const custom = safeHexColor(value);
  const current = value ?? (allowAuto ? "auto" : "primary");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowAuto ? (
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onChange("auto")}
          className={`rounded-md border px-2 py-1 text-[11px] ${
            current === "auto"
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-300 bg-white text-zinc-600"
          }`}
        >
          Auto
        </button>
      ) : null}
      {(Object.keys(THEME_COLOR_TOKENS) as ThemeColorToken[]).map((token) => (
        <button
          key={token}
          type="button"
          disabled={readOnly}
          title={THEME_COLOR_TOKENS[token].label}
          aria-label={`Theme ${THEME_COLOR_TOKENS[token].label}`}
          aria-pressed={current === token}
          onClick={() => onChange(token)}
          className={`h-6 w-6 rounded-full border ${
            current === token ? "border-zinc-900 ring-2 ring-zinc-900/25" : "border-zinc-300"
          }`}
          style={{ background: preview[token] }}
        />
      ))}
      <label
        className={`relative h-6 w-8 cursor-pointer overflow-hidden rounded border ${
          custom ? "border-zinc-900 ring-2 ring-zinc-900/25" : "border-zinc-300"
        }`}
        title="Custom color"
        style={{
          background: custom ?? "conic-gradient(#f43f5e, #f59e0b, #22c55e, #3b82f6, #a855f7, #f43f5e)",
        }}
      >
        <span className="sr-only">Custom color</span>
        <input
          type="color"
          disabled={readOnly}
          value={custom && custom.length === 7 ? custom : "#1e3a5f"}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <HexColorInput label="Custom color" value={custom ?? undefined} onChange={onChange} disabled={readOnly} />
      <span className="text-[11px] text-zinc-500">
        {current === "auto"
          ? "Matches the section"
          : isThemeColorToken(current)
            ? THEME_COLOR_TOKENS[current].label
            : (custom ?? "")}
      </span>
    </div>
  );
}

/** Type scale select; "Custom" reveals a bounded px input. */
export function TypeSizeControl({
  value,
  onChange,
  readOnly,
  defaultLabel,
}: {
  value: TypeSize | "auto" | undefined;
  onChange: (value: TypeSize | "auto") => void;
  readOnly?: boolean;
  /** When set, offers "auto" (e.g. "Match heading level"). */
  defaultLabel?: string;
}) {
  const isCustom = typeof value === "number";
  const selected = isCustom ? "custom" : (value ?? (defaultLabel ? "auto" : "base"));

  return (
    <div className="flex gap-1.5">
      <select
        value={selected}
        disabled={readOnly}
        aria-label="Font size"
        onChange={(event) => {
          const next = event.target.value;
          if (next === "custom") onChange(24);
          else onChange(next as TypeSize | "auto");
        }}
        className={controlClass}
      >
        {defaultLabel ? <option value="auto">{defaultLabel}</option> : null}
        {TYPE_TOKENS.map((token) => (
          <option key={token} value={token}>
            {TYPE_SCALE[token].label}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {isCustom ? (
        <label className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-500">
          <input
            type="number"
            min={CUSTOM_FONT_SIZE_MIN}
            max={CUSTOM_FONT_SIZE_MAX}
            value={value}
            disabled={readOnly}
            aria-label="Custom font size in px"
            onChange={(event) => {
              const amount = Number(event.target.value);
              if (Number.isFinite(amount)) onChange(amount);
            }}
            onBlur={() =>
              onChange(
                Math.round(
                  Math.min(CUSTOM_FONT_SIZE_MAX, Math.max(CUSTOM_FONT_SIZE_MIN, value)),
                ),
              )
            }
            className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs"
          />
          px
        </label>
      ) : null}
    </div>
  );
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Local date/time input stored as an absolute ISO timestamp. */
export function DateTimeControl({
  value,
  onChange,
  readOnly,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <input
      type="datetime-local"
      value={toLocalInput(value)}
      disabled={readOnly}
      onChange={(event) => {
        const date = new Date(event.target.value);
        if (!Number.isNaN(date.getTime())) onChange(date.toISOString());
      }}
      className={controlClass}
    />
  );
}

/** Visual column-ratio presets for rows. */
export function RowLayoutControl({
  value,
  onChange,
  readOnly,
}: {
  value: RowLayout | undefined;
  onChange: (value: RowLayout) => void;
  readOnly?: boolean;
}) {
  const current = safeRowLayout(value);
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Columns">
      {ROW_LAYOUT_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={current === id}
          disabled={readOnly}
          onClick={() => onChange(id)}
          className={`flex flex-col gap-1 rounded-md border p-1.5 text-[10px] font-medium transition ${
            current === id
              ? "border-zinc-900 bg-white text-zinc-900 ring-2 ring-zinc-900/15"
              : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400"
          }`}
        >
          <span className="flex h-5 gap-0.5" aria-hidden="true">
            {ROW_LAYOUTS[id].fractions.map((fraction, index) => (
              <span
                key={index}
                className={`rounded-sm ${current === id ? "bg-zinc-800" : "bg-zinc-300"}`}
                style={{ flex: fraction }}
              />
            ))}
          </span>
          {ROW_LAYOUTS[id].label}
        </button>
      ))}
    </div>
  );
}
