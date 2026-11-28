import Link from "next/link";
import { z } from "zod";
import { SocialConnections } from "@/components/dashboard/social-connections";
import { loadSocialAccounts, socialUserError } from "@/lib/social/connections";
import type { ConnectedAccount } from "@/lib/social/types";

export default async function SocialConnectedPage({ searchParams }: {
  searchParams: Promise<{ account?: string | string[] }>;
}) {
  const parsed = z.uuid().safeParse((await searchParams).account);
  if (!parsed.success) return <p role="alert">Invalid social connection return URL.</p>;
  let accounts: ConnectedAccount[] = [];
  let error = "";
  try { accounts = await loadSocialAccounts(parsed.data); }
  catch (cause) { error = socialUserError(cause); }
  if (error) return <p role="alert">{error}</p>;
  return <div className="space-y-6">
      <header><h1 className="text-3xl font-semibold">Your social accounts</h1>
        <p className="mt-2 text-sm text-[var(--platform-secondary)]">Checking which accounts are connected. Returning here does not guarantee a connection succeeded.</p>
      </header>
      <SocialConnections key={parsed.data} accountId={parsed.data} initialAccounts={accounts} syncOnMount />
      <Link href={`/dashboard/social?account=${parsed.data}`} className="platform-button">Back to Social</Link>
  </div>;
}
