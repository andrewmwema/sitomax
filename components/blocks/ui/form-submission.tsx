"use client";

import { useState, type FormEvent, type ReactNode } from "react";

export function FormSubmission({ children, className }: { children: ReactNode; className: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    if (new URLSearchParams(window.location.search).get("preview") === "1") {
      setMessage("Forms cannot be submitted in preview mode.");
      setStatus("error");
      return;
    }
    const form = event.currentTarget;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (typeof value === "string") params.append(key, value);
    params.set("_page_path", window.location.pathname);
    setStatus("sending");
    try {
      const response = await fetch("/api/forms/submit", { method: "POST", body: params });
      if (!response.ok) {
        setMessage(response.status === 429 ? "Too many submissions. Please try again later." : "Could not send your message. Please try again.");
        setStatus("error");
        return;
      }
      form.reset();
      setStatus("success");
    } catch {
      setMessage("Could not send your message. Please check your connection and try again.");
      setStatus("error");
    }
  }

  return <form method="post" action="/api/forms/submit" onSubmit={submit} className={className} aria-busy={status === "sending"}>
    {children}
    {status === "sending" ? <p role="status">Sending...</p> : null}
    {status === "success" ? <p role="status">Thank you. Your message has been sent.</p> : null}
    {status === "error" ? <p role="alert">{message}</p> : null}
  </form>;
}
