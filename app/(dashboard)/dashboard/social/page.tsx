import Link from "next/link";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { loadSocialAccounts, socialUserError } from "@/lib/social/connections";
import { SocialConnections } from "@/components/dashboard/social-connections";
import type { ConnectedAccount } from "@/lib/social/types";

export default async function SocialPage({ searchParams }: {
  searchParams: Promise<{ account?: string | string[] }>;
}) {
  const { supabase, user } = await requireUser();
  const [admin, membership, result, params] = await Promise.all([
    supabase.rpc("is_super_admin"),
    supabase.from("account_members").select("account_id").eq("user_id", user.id).eq("role", "owner"),
    supabase.from("accounts").select("id, name").order("name"),
    searchParams,
  ]);
  if (admin.error || membership.error || result.error) throw new Error("Could not load social workspaces.");
  const owners = new Set(z.array(z.object({ account_id: z.uuid() })).parse(membership.data ?? []).map((item) => item.account_id));
  const accounts = z.array(z.object({ id: z.uuid(), name: z.string() })).parse(result.data ?? [])
    .filter((account) => admin.data || owners.has(account.id));
  const requested = params.account === undefined ? undefined : z.uuid().safeParse(params.account);
  if (requested && !requested.success) return <p role="alert">Invalid social workspace.</p>;
  const account = requested?.success ? accounts.find((item) => item.id === requested.data) : accounts[0];
  if (!account) return <p role="alert">Only account owners can manage social connections for this workspace.</p>;
  let initialAccounts: ConnectedAccount[] = [];
  let error = "";
  try { initialAccounts = await loadSocialAccounts(account.id); }
  catch (cause) { error = socialUserError(cause); }
  return <div className="space-y-6">
    <header>
      <h1 className="text-3xl font-semibold">Social</h1>
      <p className="mt-2 text-sm text-[var(--platform-secondary)]">Connect your channels for {account.name}. Posting tools are coming next.</p>
    </header>
    {accounts.length > 1 ? <nav aria-label="Social workspaces" className="flex flex-wrap gap-2">
      {accounts.map((item) => <Link key={item.id} href={`/dashboard/social?account=${item.id}`}
        aria-current={item.id === account.id ? "page" : undefined} className="platform-button">{item.name}</Link>)}
    </nav> : null}
    {admin.data ? <Link className="inline-block text-sm underline" href="/dashboard/admin/social-provider">Social provider test</Link> : null}
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : <SocialConnections key={account.id} accountId={account.id} initialAccounts={initialAccounts} />}
  </div>;
}
