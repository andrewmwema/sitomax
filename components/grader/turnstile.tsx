"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export function Turnstile({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { callback.current = onToken; }, [onToken]);
  useEffect(() => {
    if (!ready || !siteKey || !container.current || !window.turnstile) return;
    const api = window.turnstile;
    const id = api.render(container.current, {
      sitekey: siteKey,
      callback: (token) => { setError(false); callback.current(token); },
      "expired-callback": () => callback.current(""),
      "error-callback": () => { callback.current(""); setError(true); },
    });
    widget.current = id;
    return () => { api.remove(id); widget.current = null; };
  }, [ready, siteKey]);
  useEffect(() => {
    if (resetKey && widget.current && window.turnstile) {
      callback.current("");
      window.turnstile.reset(widget.current);
    }
  }, [resetKey]);
  if (!siteKey) return <p role="alert" className="grader-error">Verification is unavailable. Please try again later.</p>;
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      onReady={() => setReady(true)} onError={() => setError(true)} />
    <div ref={container} />
    {error ? <p role="alert" className="grader-error">Verification couldn&apos;t load. Please refresh and try again.</p> : null}
  </>;
}
