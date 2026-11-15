"use client";

import { useContext, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EditorSiteContext } from "@/components/editor/image-upload-field";

const BUCKET = "site-assets";
const MAX_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = ["video/mp4", "video/webm"];

/**
 * Background video upload (MP4/WebM up to 50MB) to the site's folder in
 * the "site-assets" bucket. The checks here are UX only — the bucket
 * itself enforces the size limit and MIME types server-side (see
 * supabase/migrations/0006_site_assets_limits.sql).
 */
export function VideoUploadField({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  const editorSite = useContext(EditorSiteContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!editorSite) {
      setError("Uploads are unavailable here.");
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only MP4 and WebM videos are supported.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Videos can be up to 50MB.");
      return;
    }
    setUploading(true);
    setError(null);

    const supabase = createClient();
    const extension = file.type === "video/webm" ? "webm" : "mp4";
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
        <video
          src={value}
          muted
          playsInline
          preload="metadata"
          className="h-24 w-full rounded-md border border-zinc-200 bg-zinc-950 object-cover"
        />
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={readOnly || uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : value ? "Replace video" : "Upload video (MP4/WebM)"}
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
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
