"use client";

import { useMemo, useState } from "react";
import { BlockIcon, ICON_NAMES } from "@/components/blocks/ui/icon";

/**
 * Custom Puck field: searchable grid over the curated lucide icon set.
 * Stores the icon name string on the block props.
 */
export function IconPickerField({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICON_NAMES;
    return ICON_NAMES.filter((name) => name.includes(q));
  }, [query]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700">
          <BlockIcon name={value} size={18} />
        </span>
        <input
          type="search"
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
            disabled={readOnly}
            onClick={() => onChange(name)}
            className={`flex aspect-square items-center justify-center rounded-md transition hover:bg-zinc-100 disabled:opacity-50 ${
              value === name ? "bg-zinc-900 text-white hover:bg-zinc-800" : "text-zinc-600"
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
    </div>
  );
}
