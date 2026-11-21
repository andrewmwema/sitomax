"use client";

import { useState } from "react";

export function HexColorInput({ label, value, onChange, disabled }: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [previousValue, setPreviousValue] = useState(value);
  const [text, setText] = useState(value?.startsWith("#") ? value : "");
  if (value !== previousValue) {
    setPreviousValue(value);
    setText(value?.startsWith("#") ? value : "");
  }

  const normalized = text.trim().replace(/^#?/, "#");
  const valid = /^#[0-9a-f]{6}$/i.test(normalized);
  const invalid = !valid && (text !== "" || Boolean(value?.startsWith("#")));

  return <span className="inline-flex min-w-0 flex-col gap-1">
    <input
      type="text"
      aria-label={`${label} hex`}
      aria-invalid={invalid}
      disabled={disabled}
      placeholder="#RRGGBB"
      title="Enter six hex digits, then press Enter or leave the field to apply."
      pattern="#?[0-9a-fA-F]{6}"
      required={Boolean(value?.startsWith("#"))}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => { if (valid && normalized.toLowerCase() !== value?.toLowerCase()) onChange(normalized); }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-xs disabled:opacity-60"
    />
    {invalid ? <span role="alert" className="text-[11px] text-red-700">Use 6 hex digits; the previous color remains applied.</span> : null}
  </span>;
}
