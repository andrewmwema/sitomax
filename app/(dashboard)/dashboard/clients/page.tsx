import { Suspense } from "react";
import { z } from "zod";
import { Globe2, Plus, UserCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { getAiUsageSummaries } from "@/lib/ai/reporting";
import { clientDirectoryHref, clientDirectorySchema } from "@/lib/clients/directory";
import { CreateAccountForm } from "@/components/dashboard/create-account-form";
import { ClientDirectory, type ClientAccount } from "@/components/dashboard/client-directory";
import { ClientDetails } from "@/components/dashboard/client-details";
import { WorkspaceDialog } from "@/components/dashboard/workspace-dialog";
import { WorkspaceMetrics } from "@/components/dashboard/workspace-metrics";
import { createAccount } from "./actions";

const accountSchema: z.ZodType<ClientAccount> = z.object({
  id: z.uuid(), name: z.string(), created_at: z.string(),
  account_members: z.array(z.object({
    role: z.enum(["owner", "editor"]),
    profile: z.object({ email: z.string().nullable(), full_name: z.string().nullable() }).nullable(),
  })),
  sites: z.array(z.object({ id: z.uuid(), name: z.string().nullable(), subdomain: z.string() })),
  ai_limits: z.object({ monthly_site_generations: z.number(), monthly_edits: z.number(), extra_credits: z.number() }).nullable(),
});

export default function ClientsPage({ searchParams }: PageProps<"/dashboard/clients">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<div role="status" aria-label="Loading client directory" className="h-64 animate-pulse rounded-2xl bg-[var(--platform-subtle)]" />}><ClientsContent searchParams={searchParams} /></Suspense>
    </section>
  );
}

async function ClientsContent({ searchParams }: { searchParams: PageProps<"/dashboard/clients">["searchParams"] }) {
  const { supabase } = await requireSuperAdmin();
  const parsed = clientDirectorySchema.safeParse(await searchParams);
  if (!parsed.success) return <p role="alert">Choose valid client filters and keep searches under 200 characters.</p>;
  const filters = parsed.data;

  const accounts: ClientAccount[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from("accounts")
      .select("id, name, created_at, account_members(role, profile:profiles(email, full_name)), sites(id, name, subdomain), ai_limits(monthly_site_generations, monthly_edits, extra_credits)")
      .eq("is_internal", false).order("created_at", { ascending: false }).order("id").range(from, from + 499);
    if (error) throw new Error("Could not load client accounts.", { cause: error });
    const batch = z.array(accountSchema).parse(data ?? []);
    accounts.push(...batch);
    if (batch.length < 500) break;
  }
  if (filters.client) {
    const account = accounts.find((value) => value.id === filters.client);
    const backHref = clientDirectoryHref(filters);
    if (!account) return <div className="space-y-4"><Link className="platform-button" href={backHref}>Back to clients</Link>
      <p role="alert">That client is unavailable or you do not have permission to view it.</p></div>;
    const allowance = (await getAiUsageSummaries()).find((usage) => usage.account_id === account.id);
    return <ClientDetails account={account} allowance={allowance} backHref={backHref} />;
  }
  const ownersAssigned = accounts.filter((account) => account.account_members.some((member) => member.role === "owner")).length;
  return <>
    <header className="flex flex-wrap items-end justify-between gap-4"><div>
      <p className="platform-eyebrow mb-1">Workspace</p>
      <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">Manage client relationships, websites, and account access.</p>
    </div>
      <WorkspaceDialog title="Add a client" description="A dedicated account for your client's websites and team." drawer={false}
        trigger={<><Plus size={15} />Add client</>} triggerClassName="platform-button platform-button-primary">
        <CreateAccountForm action={createAccount} />
      </WorkspaceDialog>
    </header>
    <WorkspaceMetrics metrics={[
      { label: "Total clients", value: accounts.length, detail: "Client accounts only", icon: Users },
      { label: "Owner assigned", value: ownersAssigned, detail: "Accounts with an owner membership", icon: UserCheck },
      { label: "Needs owner", value: accounts.length - ownersAssigned, detail: "Ready for an owner invitation", icon: UserPlus },
      { label: "Assigned websites", value: accounts.reduce((count, account) => count + account.sites.length, 0), detail: "Across client accounts", icon: Globe2 },
    ]} />
    <ClientDirectory accounts={accounts} initialFilters={filters} />
  </>;
}
