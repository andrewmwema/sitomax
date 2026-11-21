"use client";

import { useMemo, useState } from "react";
import { BlockIcon, ICON_NAMES } from "@/components/blocks/ui/icon";
import { readIcon, type IconValue } from "@/lib/icons";
import { THEME_COLOR_TOKENS } from "@/lib/layout/guardrails";
import { HexColorInput } from "./hex-color-input";

/**
 * Custom Puck field: searchable grid over the curated lucide icon set.
 * Legacy names remain strings; size and color overrides are stored with the name.
 */
export function IconPickerField({
  value,
  onChange,
  readOnly,
}: {
  value: IconValue;
  onChange: (value: IconValue) => void;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const icon = readIcon(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICON_NAMES;
    return ICON_NAMES.filter((name) => name.replaceAll("-", " ").includes(q) || name.includes(q));
  }, [query]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700">
          <BlockIcon name={icon.name} size={18} />
        </span>
        <input
          type="search"
          aria-label="Search icons"
          value={query}
          disabled={readOnly}
          placeholder="Search icons…"
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs disabled:opacity-50"
        />
      </div>
      <div className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto rounded-md border border-zinc-200 p-1.5">
        {filtered.map((name) => (
          <button
            key={name}
            type="button"
            title={name}
            aria-label={name.replaceAll("-", " ")}
            aria-pressed={icon.name === name}
            disabled={readOnly}
            onClick={() => onChange(icon.size || icon.color ? { ...icon, name } : name)}
            className={`flex aspect-square items-center justify-center rounded-md transition hover:bg-zinc-100 disabled:opacity-50 ${
              icon.name === name ? "bg-zinc-900 text-white hover:bg-zinc-800" : "text-zinc-600"
            }`}
          >
            <BlockIcon name={name} size={17} />
          </button>
        ))}
        {filtered.length === 0 ? (
          <p className="col-span-6 px-2 py-3 text-center text-xs text-zinc-400">
            No icons match “{query}”.
          </p>
        ) : null}
      </div>
      <label className="text-xs">Icon size
        <select aria-label="Icon size" disabled={readOnly} value={icon.size ?? ""}
          onChange={(event) => {
            onChange({ ...icon, size: event.target.value ? Number(event.target.value) : undefined });
          }}
          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5">
          <option value="">Design default</option>
          {[12, 16, 20, 22, 24, 26, 32, 48, 64, 96].map((size) => <option key={size} value={size}>{size}px</option>)}
        </select>
      </label>
      <label className="text-xs">Icon color
        <select aria-label="Icon color" disabled={readOnly}
          value={icon.color?.startsWith("#") ? "custom" : icon.color ?? ""}
          onChange={(event) => {
            onChange({ ...icon, color: event.target.value === "custom" ? "#17202b" : event.target.value || undefined });
          }}
          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5">
          <option value="">Design default</option>
          <option value="auto">Inherit text color</option>
          {Object.entries(THEME_COLOR_TOKENS).map(([name, { label }]) => <option key={name} value={name}>{label}</option>)}
          <option value="custom">Custom color</option>
        </select>
      </label>
      {icon.color?.startsWith("#") ? <div className="flex flex-wrap items-start justify-between gap-2 text-xs"><span>Custom icon color</span>
        <input aria-label="Custom icon color" type="color" disabled={readOnly} value={icon.color}
          onChange={(event) => onChange({ ...icon, color: event.target.value })} />
        <HexColorInput label="Custom icon color" value={icon.color} disabled={readOnly} onChange={(color) => onChange({ ...icon, color })} />
      </div> : null}
    </div>
  );
}
