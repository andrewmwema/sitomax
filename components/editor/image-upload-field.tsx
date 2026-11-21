"use client";

import { createContext, useContext, useState } from "react";
import { MediaPicker } from "./media-picker";
import type { MediaImage } from "@/lib/media";

export const EditorSiteContext = createContext<{ siteId: string; query?: string } | null>(null);

export function ImageUploadField({ value, onChange, onSelect, readOnly, agency = false, initialQuery, imageClassName }: {
  value: string; onChange: (value: string) => void; onSelect?: (image: MediaImage) => void;
  readOnly?: boolean; agency?: boolean; initialQuery?: string; imageClassName?: string;
}) {
  const site = useContext(EditorSiteContext);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const available = Boolean(site || agency);
  return <div className="flex flex-col gap-2">
    {value ? (
      // eslint-disable-next-line @next/next/no-img-element -- configured media URLs are rendered as previews
      <img src={value} alt="" className={imageClassName ?? "h-24 w-full rounded-lg border border-[#E8E7E3] object-cover"} />
    ) : null}
    <div className="flex gap-2">
      <button type="button" disabled={readOnly || !available} onClick={() => setOpen(true)} className="platform-button flex-1">
        {value ? "Replace image" : "Choose image"}
      </button>
      {value ? <button type="button" disabled={readOnly} onClick={() => {
        setError("");
        try { if (onSelect) onSelect({ url: "", alt: "" }); else onChange(""); }
        catch { setError("Could not remove this image. Please reopen its controls and retry."); }
      }}
        className="platform-button">Remove</button> : null}
    </div>
    {!available ? <p role="alert" className="text-xs text-red-700">Site media is unavailable here.</p> : null}
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    {open && available ? <MediaPicker scope={agency ? { agency: true } : { siteId: site!.siteId }}
      initialQuery={[site?.query, initialQuery].filter(Boolean).join(" ").slice(0, 100) || "business"} value={value}
      onClose={() => setOpen(false)} onSelect={(image) => onSelect ? onSelect(image) : onChange(image.url)} /> : null}
  </div>;
}
