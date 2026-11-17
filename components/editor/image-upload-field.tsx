"use client";

import { createContext, useContext, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Editor context: tells Puck custom fields which site they are editing,
 * so image uploads land in the site's own storage folder.
 */
export const EditorSiteContext = createContext<{ siteId: string } | null>(null);

const BUCKET = "site-assets";

/**
 * Custom Puck field for images. Uploads to the "site-assets" bucket in a
 * folder per site (access enforced by storage RLS) and stores the public
 * URL as the field value. Also accepts a pasted URL.
 */
export function ImageUploadField({
  value,
  onChange,
  readOnly,
  allowUrl = true,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  allowUrl?: boolean;
}) {
  const editorSite = useContext(EditorSiteContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!editorSite) {
      setError("Uploads are unavailable here. Paste an image URL instead.");
      return;
    }
    setUploading(true);
    setError(null);

    const supabase = createClient();
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${editorSite.siteId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setError("Upload failed. Please try again.");
    } else {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    }
    setUploading(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={value}
          alt=""
          className="h-24 w-full rounded-md border border-zinc-200 object-cover"
        />
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={readOnly || uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
        </button>
        {value ? (
          <button
            type="button"
            disabled={readOnly || uploading}
            onClick={() => onChange("")}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {allowUrl ? <input
        type="text"
        value={value ?? ""}
        disabled={readOnly}
        placeholder="…or paste an image URL"
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs disabled:opacity-50"
      /> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
