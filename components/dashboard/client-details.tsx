import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { inviteOwner } from "@/app/(dashboard)/dashboard/clients/actions";
import { InviteOwnerForm } from "./invite-owner-form";
import type { ClientAccount } from "./client-directory";

export function ClientDetails({ account, backHref }: { account: ClientAccount; backHref: string }) {
  return <article className="mx-auto w-full max-w-6xl space-y-6">
    <Link href={backHref} className="platform-button"><ArrowLeft size={15} />Back to clients</Link>
    <header><p className="platform-eyebrow mb-1">Client account</p>
      <h1 className="break-words text-2xl font-semibold tracking-tight">{account.name}</h1>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">Client information, websites and account access.</p></header>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="platform-panel p-5"><h2 className="text-sm font-semibold">Client account</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-[var(--platform-muted)]">Joined (UTC)</dt><dd className="mt-1">{new Date(account.created_at).toLocaleDateString("en", { timeZone: "UTC" })}</dd></div>
          <div><dt className="text-xs text-[var(--platform-muted)]">Team members</dt><dd className="mt-1">{account.account_members.length}</dd></div>
        </dl></section>
        <section className="platform-panel p-5"><h2 className="text-sm font-semibold">Websites</h2>
          {account.sites.length ? <ul className="mt-2 divide-y divide-[var(--platform-line)]">{account.sites.map((site) => <li key={site.id}><Link href={`/dashboard/sites/${site.id}`} className="flex items-center justify-between gap-3 py-3 text-sm font-medium hover:underline">{site.name || site.subdomain}<ArrowUpRight size={14} /></Link></li>)}</ul> : <p className="mt-2 text-sm text-[var(--platform-muted)]">No websites assigned yet.</p>}
          <Link href="/dashboard/sites/new" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--platform-accent)] hover:underline">Create a website<ArrowUpRight size={13} /></Link>
        </section>
        <section className="platform-panel p-5"><h2 className="text-sm font-semibold">AI allowance</h2>
          {account.ai_limits ? <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt>Site generations / month</dt><dd className="font-medium tabular-nums">{account.ai_limits.monthly_site_generations}</dd></div>
            <div className="flex justify-between gap-3"><dt>Edits / month</dt><dd className="font-medium tabular-nums">{account.ai_limits.monthly_edits}</dd></div>
            <div className="flex justify-between gap-3"><dt>Extra credits</dt><dd className="font-medium tabular-nums">{account.ai_limits.extra_credits}</dd></div>
          </dl> : <p className="mt-2 text-sm text-[var(--platform-muted)]">No allowance configured.</p>}
          <Link href="/dashboard/ai-usage" className="mt-3 inline-block text-xs font-medium text-[var(--platform-accent)] hover:underline">View AI usage and allowances</Link>
        </section>
      </div>
      <section className="platform-panel space-y-5 p-5"><h2 className="text-sm font-semibold">User access</h2>
        {account.account_members.length ? <ul className="space-y-3">{account.account_members.map((member, index) => <li key={index} className="flex items-start justify-between gap-3 text-sm">
          <span className="min-w-0 break-words">{member.profile?.full_name || member.profile?.email || "Profile unavailable"}
            {member.profile?.full_name && member.profile.email ? <span className="mt-1 block text-xs text-[var(--platform-muted)]">{member.profile.email}</span> : null}</span>
          <span className="platform-status capitalize">{member.role}</span>
        </li>)}</ul> : <p className="text-sm text-[var(--platform-muted)]">Invite an owner to give this client access.</p>}
        <div className="border-t border-[var(--platform-line)] pt-5"><h3 className="mb-3 text-sm font-semibold">Invite an account owner</h3><InviteOwnerForm accountId={account.id} action={inviteOwner} />
          <p className="mt-3 text-xs leading-relaxed text-[var(--platform-muted)]">Invitation delivery feedback appears here after sending. Acceptance status and invitation history are not currently tracked.</p>
        </div>
      </section>
    </div>
  </article>;
}
