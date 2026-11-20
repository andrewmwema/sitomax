"use client";

import { useState } from "react";

export function BlogShareLinks({ url, title }: { url: string; title: string }) {
  const [message, setMessage] = useState("");
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const links = [
    ["X", `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`],
    ["Email", `mailto:?subject=${encodedTitle}&body=${encodedUrl}`],
  ] as const;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      setMessage("Could not copy the link.");
    }
  }
  return <div className="flex flex-wrap items-center gap-2" aria-label="Share this post">
    {links.map(([label, href]) => <a key={label} href={href} target={label === "Email" ? undefined : "_blank"}
      rel={label === "Email" ? undefined : "noreferrer"} className="inline-flex min-h-10 items-center rounded-full border border-current/20 px-3 text-xs font-medium hover:bg-[var(--color-soft)]">
      {label}
    </a>)}
    <button type="button" onClick={() => void copy()}
      className="inline-flex min-h-10 items-center rounded-full border border-current/20 px-3 text-xs font-medium hover:bg-[var(--color-soft)]">
      Copy link
    </button>
    <span role="status" aria-live="polite" className="sr-only">{message}</span>
  </div>;
}
