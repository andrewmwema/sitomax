import { Suspense } from "react";
import { requireSuperAdmin } from "@/lib/auth";
import { CreateAccountForm } from "@/components/dashboard/create-account-form";
import { InviteOwnerForm } from "@/components/dashboard/invite-owner-form";
import { createAccount, inviteOwner } from "./actions";

type AccountRow = {
  id: string;
  name: string;
  created_at: string;
  account_members: {
    role: string;
    profile: { email: string | null; full_name: string | null } | null;
  }[];
  sites: { id: string }[];
};

/**
 * Clients page (super admin only): list accounts, create accounts,
 * invite owners by email.
 */
export default function ClientsPage() {
  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Manage client accounts and their team members.
        </p>
      </header>
      <Suspense
        fallback={<div className="h-48 animate-pulse rounded-2xl bg-zinc-200" />}
      >
        <ClientsContent />
      </Suspense>
    </section>
  );
}

async function ClientsContent() {
  const { supabase } = await requireSuperAdmin();

  const { data } = await supabase
    .from("accounts")
    .select(
      "id, name, created_at, account_members(role, profile:profiles(email, full_name)), sites(id)",
    )
    .order("created_at", { ascending: true });

  // Without generated DB types, supabase-js infers to-one joins (profile)
  // as arrays; at runtime they are single objects, so cast through unknown.
  const accounts = (data ?? []) as unknown as AccountRow[];

  return (
    <div className="flex flex-col gap-6">
      <CreateAccountForm action={createAccount} />

      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="font-medium text-zinc-900">No clients yet</p>
          <p className="mt-1 text-sm text-zinc-600">
            Create your first client account above.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-zinc-900">
                    {account.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {account.sites.length}{" "}
                    {account.sites.length === 1 ? "site" : "sites"} · since{" "}
                    {new Date(account.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {account.account_members.length > 0 && (
                <ul className="mt-4 flex flex-col gap-1.5">
                  {account.account_members.map((member, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="truncate text-zinc-700">
                        {member.profile?.full_name ??
                          member.profile?.email ??
                          "Pending user"}
                        {member.profile?.full_name && member.profile?.email && (
                          <span className="ml-2 text-zinc-400">
                            {member.profile.email}
                          </span>
                        )}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 capitalize">
                        {member.role}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 border-t border-zinc-100 pt-4">
                <InviteOwnerForm accountId={account.id} action={inviteOwner} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
