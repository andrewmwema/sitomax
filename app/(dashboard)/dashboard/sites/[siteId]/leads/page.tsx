import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { SiteSettingsNav } from "@/components/dashboard/site-settings-nav";
import { LeadSettingsForm } from "@/components/dashboard/lead-settings-form";
import { CopyLeadValue } from "@/components/dashboard/lead-controls";
import { TableScrollArea } from "@/components/dashboard/table-scroll-area";
import { LeadRecipients } from "@/components/dashboard/lead-recipients";

export default function LeadSettingsPage({ params }: PageProps<"/dashboard/sites/[siteId]/leads">) {
  return <Suspense fallback={<p role="status">Loading lead settings…</p>}><LeadSettings params={params} /></Suspense>;
}

async function LeadSettings({ params }: { params: PageProps<"/dashboard/sites/[siteId]/leads">["params"] }) {
  const { siteId } = await params;
  if (!z.uuid().safeParse(siteId).success) notFound();
  const { supabase, user } = await requireUser();
  const [site, access, admin] = await Promise.all([
    supabase.from("sites").select("name, subdomain, account_id").eq("id", siteId).maybeSingle(),
    supabase.rpc("can_manage_site_leads", { p_site: siteId }),
    supabase.rpc("is_super_admin"),
  ]);
  if (site.error || access.error || admin.error) throw new Error("Could not check lead settings permissions.");
  if (!site.data || !access.data) notFound();
  const [settings, preferences, log, limit, recipients] = await Promise.all([
    supabase.from("lead_site_settings").select("recipients, webhook_url, webhook_secret, reply_mode, new_lead_enabled, reply_notifications_enabled, digest_enabled").eq("site_id", siteId)
      .maybeSingle<{ recipients: string[]; webhook_url: string | null; webhook_secret: string | null; reply_mode: "tracked" | "direct"; new_lead_enabled: boolean; reply_notifications_enabled: boolean; digest_enabled: boolean }>(),
    supabase.from("lead_notification_preferences").select("new_lead, replies, digest").eq("site_id", siteId)
      .eq("user_id", user.id).maybeSingle<{ new_lead: boolean; replies: boolean; digest: boolean }>(),
    supabase.from("lead_webhook_deliveries").select("event_id, event_type, status, attempts, http_status, created_at").eq("site_id", siteId)
      .order("created_at", { ascending: false }).order("event_id", { ascending: false }).limit(50),
    admin.data === true ? supabase.from("lead_send_limits").select("daily_limit").eq("account_id", site.data.account_id).maybeSingle() : null,
    supabase.rpc("lead_new_notification_recipients", { p_site: siteId }),
  ]);
  if (settings.error || preferences.error) throw new Error("Could not load lead settings.");
  const effective = z.array(z.email()).safeParse(recipients.data);
  return <section className="flex flex-col gap-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div>
      <p className="platform-eyebrow">{site.data.name || site.data.subdomain}</p>
      <h1 className="mt-1 text-2xl font-semibold">Lead settings</h1>
    </div><Link className="platform-button" href={`/dashboard/forms?site=${siteId}`}>Open lead inbox</Link></header>
    <SiteSettingsNav siteId={siteId} current="leads" canManageDomains />
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="platform-panel space-y-3 p-5"><h2 className="font-semibold">Notifications</h2>
        <p className="text-sm text-[var(--platform-muted)]">An empty list uses all account owners. Adding addresses replaces that default, so include owners you want to notify. Only add addresses authorized to receive lead summaries for this site.</p>
        <LeadRecipients siteId={siteId} initial={settings.data?.recipients ?? []} />
        {recipients.error || !effective.success ? <p role="alert" className="text-sm text-[var(--platform-error)]">Current recipients are unavailable.</p> :
          <p className="text-sm">New-lead recipients after personal opt-outs and suppressions: {effective.data.length ? effective.data.join(", ") : "None"}.
            {settings.data?.new_lead_enabled === false ? " New-lead emails are switched off for this site." : ""}</p>}
        <LeadSettingsForm siteId={siteId} intent="notifications">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="new_lead_enabled" defaultChecked={settings.data?.new_lead_enabled ?? true} /> Email on new lead</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reply_notifications_enabled" defaultChecked={settings.data?.reply_notifications_enabled ?? true} /> Email on lead reply</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="digest_enabled" defaultChecked={settings.data?.digest_enabled ?? true} /> Allow daily digests</label>
          <p className="text-xs text-[var(--platform-muted)]">These switches limit, but do not override, personal preferences. Digests go to opted-in users, not the recipient list.</p>
          <p className="text-xs text-[var(--platform-muted)]">Reply emails sent directly to your mailbox are not affected by the reply notification switch.</p>
        </LeadSettingsForm>
        <p className="text-xs text-[var(--platform-muted)]">The test uses saved recipients and personal preferences, even when site-wide new-lead emails are off.</p>
        <LeadSettingsForm siteId={siteId} intent="test_notification" />
      </section>
      <section className="platform-panel space-y-3 p-5"><h2 className="font-semibold">Your email preferences</h2>
        <p className="text-sm text-[var(--platform-muted)]">New lead preferences apply if your email is a recipient. Your digest goes to your account email.</p>
        <LeadSettingsForm siteId={siteId} intent="preferences">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="new_lead" defaultChecked={preferences.data?.new_lead ?? true} /> New lead email</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="replies" defaultChecked={preferences.data?.replies ?? true} /> Forward replies to my email</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="digest" defaultChecked={preferences.data?.digest ?? false} /> Daily digest</label>
        </LeadSettingsForm>
      </section>
    </div>
    <section className="platform-panel space-y-3 p-5"><h2 className="font-semibold">Lead replies</h2>
      <LeadSettingsForm siteId={siteId} intent="reply_mode">
        <fieldset className="space-y-3">
          <legend className="sr-only">Where to deliver replies</legend>
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="reply_mode" value="tracked" defaultChecked={settings.data?.reply_mode !== "direct"} />
            <span>Track in SitoMax + forward to my email<span className="block text-xs text-[var(--platform-muted)]">Replies appear in Leads and are forwarded to notification recipients who opted in.</span></span></label>
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="reply_mode" value="direct" defaultChecked={settings.data?.reply_mode === "direct"} />
            <span>Send replies directly to my email<span className="block text-xs text-[var(--platform-muted)]">New outbound emails use the first notification address (alphabetically). Their replies will not be tracked, forwarded, or shown in the inbox.</span></span></label>
        </fieldset>
      </LeadSettingsForm>
    </section>
    {limit ? <section className="platform-panel space-y-3 p-5"><h2 className="font-semibold">Daily account reply limit</h2>
      <p className="text-sm text-[var(--platform-muted)]">Shared by all sites on this account. Resets at midnight UTC.</p>
      {limit.error ? <p role="alert" className="text-sm">Could not load the account limit.</p> : <LeadSettingsForm siteId={siteId} intent="limit">
        <label className="block text-sm">Send attempts per day
          <input type="number" name="daily_limit" min={0} max={10000} required defaultValue={limit.data?.daily_limit ?? 50}
            className="ml-2 border px-3" /></label>
      </LeadSettingsForm>}
    </section> : null}
    <section className="platform-panel space-y-4 p-5"><h2 className="font-semibold">Outgoing webhook</h2>
      <p className="text-sm text-[var(--platform-muted)]">Connect a trusted webhook catcher. It receives submitted answers and lead events for this site. Clear the URL to turn delivery off.</p>
      <LeadSettingsForm siteId={siteId} intent="webhook">
        <label className="block text-sm">Webhook URL
          <input type="url" name="url" maxLength={2048} className="mt-1 block w-full border px-3 text-sm"
            placeholder="https://…" defaultValue={settings.data?.webhook_url ?? ""} /></label>
        {settings.data?.webhook_secret ? <label className="flex items-center gap-2 text-sm">
          <input name="rotate" type="checkbox" /> Rotate signing secret (cancels outstanding retries)
        </label> : null}
      </LeadSettingsForm>
      {settings.data?.webhook_secret ? <div className="flex flex-wrap items-center gap-2">
        <CopyLeadValue key={settings.data.webhook_secret} value={settings.data.webhook_secret} label="signing secret" />
        <p className="text-xs text-[var(--platform-muted)]">Verify the X-SitoMax-Signature header against the raw request body.</p>
      </div> : null}
    </section>
    <section className="platform-panel overflow-hidden"><h2 className="p-5 font-semibold">Webhook deliveries <span className="text-sm font-normal text-[var(--platform-muted)]">(last 50)</span></h2>
      {log.error ? <p role="alert" className="px-5 pb-5 text-sm">Delivery history is unavailable.</p> : log.data.length ? <TableScrollArea label="Webhook delivery history">
        <table className="min-w-[590px] w-full text-left text-sm"><thead><tr>{["Event", "Queued (UTC)", "Status", "Attempts", "HTTP"].map((label) =>
          <th key={label} scope="col" className="px-4">{label}</th>)}</tr></thead>
          <tbody>{log.data.map((entry) => <tr key={entry.event_id}>
            <td className="px-4">{entry.event_type}</td><td className="px-4">{new Date(entry.created_at).toLocaleString("en", { timeZone: "UTC" })}</td>
            <td className="px-4 capitalize">{entry.status}</td><td className="px-4">{entry.attempts}</td><td className="px-4">{entry.http_status ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </TableScrollArea> : <p className="px-5 pb-5 text-sm text-[var(--platform-muted)]">No deliveries yet. New events will appear here after you configure a URL.</p>}
    </section>
  </section>;
}
