"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { connectAccounts, syncAccounts } from "@/app/(dashboard)/dashboard/social/actions";
import { platformLabels, socialPlatforms, type ConnectedAccount } from "@/lib/social/types";

export function SocialConnections({ accountId, initialAccounts, syncOnMount = false }: {
  accountId: string; initialAccounts: ConnectedAccount[]; syncOnMount?: boolean;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connectUrl, setConnectUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const synced = useRef(false);

  function sync() {
    startTransition(async () => {
      setError(""); setNotice(""); setConnectUrl("");
      const result = await syncAccounts(accountId);
      if (result.error) setError(result.error);
      else if (result.accounts) { setAccounts(result.accounts); setNotice("Connection status refreshed."); }
    });
  }
  function connect() {
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    setError(""); setNotice(""); setConnectUrl("");
    startTransition(async () => {
      try {
        const result = await connectAccounts(accountId);
        if (result.error || !result.url) {
          popup?.close();
          setError(result.error || "Could not create a connection link. Please try again.");
        } else if (popup && !popup.closed) {
          popup.location.replace(result.url);
          setNotice("The secure connection opened in a new tab. Return here and refresh your accounts when finished.");
        } else {
          setConnectUrl(result.url);
          setNotice("Your browser blocked or closed the new tab. Open the secure connection below.");
        }
      } catch {
        popup?.close();
        console.error("Could not start the social connection.");
        setError("Could not start the social connection. Please try again.");
      }
    });
  }
  useEffect(() => {
    if (!syncOnMount || synced.current) return;
    synced.current = true;
    startTransition(async () => {
      const result = await syncAccounts(accountId);
      if (result.error) setError(result.error);
      else if (result.accounts) { setAccounts(result.accounts); setNotice("Connection status refreshed."); }
    });
  }, [accountId, syncOnMount]);

  return <section className="space-y-5">
    <div className="flex flex-wrap gap-3">
      <button type="button" className="platform-button platform-button-primary min-h-11" disabled={pending} onClick={connect}>
        <Link2 size={16} />{pending ? "Working..." : "Connect your accounts"}
      </button>
      <button type="button" className="platform-button min-h-11" disabled={pending} onClick={sync}><RefreshCw size={16} />Refresh accounts</button>
    </div>
    <p className="text-sm text-[var(--platform-secondary)]">You&apos;ll connect through our secure publishing partner.</p>
    {connectUrl ? <a href={connectUrl} target="_blank" rel="noopener noreferrer" className="platform-button platform-button-primary min-h-11">
      Open secure connection (new tab)
    </a> : null}
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    <p role="status" className="text-sm text-[var(--platform-secondary)]">{pending ? "Updating social connections..." : notice}</p>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {socialPlatforms.map((platform) => {
        const account = accounts.find((item) => item.platform === platform);
        const status = account?.status === "connected" ? "Connected" : account?.status === "needs_reconnect" ? "Needs reconnect" : "Not connected";
        return <article key={platform} className="rounded-2xl border border-[var(--platform-line)] bg-[var(--platform-panel)] p-5">
          <div className="flex size-11 items-center justify-center rounded-full bg-[var(--platform-subtle)] font-semibold" aria-hidden="true">
            {(account?.displayName || platformLabels[platform]).slice(0, 1).toUpperCase()}
          </div>
          <h2 className="mt-4 font-semibold">{platformLabels[platform]}</h2>
          <p className="mt-1 break-words text-sm text-[var(--platform-secondary)]">{account?.displayName || "Connect an account to get started."}</p>
          <p className="mt-3 text-xs font-medium">{status}</p>
        </article>;
      })}
    </div>
    <details className="rounded-xl border border-[var(--platform-line)] p-4 text-sm">
      <summary className="cursor-pointer font-medium">Before you connect</summary>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--platform-secondary)]">
        <li>Facebook: use an account with permission to manage the Page you want to publish to.</li>
        <li>Instagram: use a professional Business or Creator account. Connection requirements depend on the offered login flow.</li>
        <li>Google: you must be an Owner or Manager of the Business Profile.</li>
        <li>LinkedIn: use an account with permission to publish to your company Page.</li>
      </ul>
    </details>
  </section>;
}
