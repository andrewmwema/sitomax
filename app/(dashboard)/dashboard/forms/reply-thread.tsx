import { z } from "zod";
import type { requireUser } from "@/lib/auth";
import { businessSchema, emptyBusiness } from "@/lib/business";
import { submissionContact, submissionFields, type Lead } from "@/lib/forms/submissions";
import { getSiteUrl } from "@/lib/site-url";
import { cleanLeadEmailHtml } from "@/lib/leads/reply-content";
import { LeadReplyComposer, type LeadReplyTemplate } from "@/components/dashboard/lead-reply-composer";
import { LeadReplyActions } from "@/components/dashboard/lead-reply-actions";

type Message = {
  id: string; direction: "in" | "out"; subject: string; body_html: string; delivery_state: string;
  auto_reply: boolean; has_attachments: boolean; created_at: string; lead_reply_forwards: { state: string }[];
};
const labels: Record<string, string> = { sending: "Sending / not confirmed", sent: "Accepted for delivery", failed: "Sending failed", received: "Received" };

export async function LeadReplyThread({ lead, supabase }: {
  lead: Lead; supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
}) {
  const [route, thread, templates, site, pages] = await Promise.all([
    supabase.rpc("get_lead_reply_route", { p_lead: lead.id }),
    supabase.from("lead_messages").select("id, direction, subject, body_html, delivery_state, auto_reply, has_attachments, created_at, lead_reply_forwards(state)")
      .eq("lead_id", lead.id).order("created_at", { ascending: false }).order("id").limit(100).returns<Message[]>(),
    supabase.from("lead_reply_templates").select("id, name, body_text").eq("site_id", lead.site_id).order("name").limit(100).returns<LeadReplyTemplate[]>(),
    supabase.from("sites").select("name, subdomain, business, custom_domain, domain_verified").eq("id", lead.site_id).maybeSingle(),
    supabase.from("pages").select("id, title, slug").eq("site_id", lead.site_id).not("published_at", "is", null).order("title"),
  ]);
  if (route.error || thread.error || templates.error || site.error || pages.error || !site.data) {
    console.error("Could not load a lead conversation", { leadId: lead.id, code: route.error?.code ?? thread.error?.code ?? templates.error?.code ?? site.error?.code ?? pages.error?.code });
    return <p role="alert" className="text-sm">The reply conversation is unavailable.</p>;
  }
  const business = businessSchema.parse({ ...emptyBusiness, ...site.data.business });
  const name = business.businessName || site.data.name || site.data.subdomain;
  const siteUrl = getSiteUrl(site.data);
  const contact = submissionContact(lead.data);
  const email = z.email().safeParse(route.data?.email);
  const date = (value: string) => new Date(value).toLocaleString("en", { timeZone: "UTC" });
  const renderBody = (message: Message) => <>
    <div className="rich-text break-words text-sm" dangerouslySetInnerHTML={{ __html: cleanLeadEmailHtml(message.body_html) }} />
    {message.has_attachments ? <p className="text-xs">Attachments not shown.</p> : null}
  </>;
  return <section className="space-y-3 border-t border-[var(--platform-line)] pt-4">
    <h3 className="text-sm font-semibold">Conversation</h3>
    <ol className="space-y-2">
      <li className="platform-panel space-y-2 p-3"><p className="text-sm font-semibold">Original form submission</p>
        <p className="text-xs text-[var(--platform-muted)]">{date(lead.created_at)} UTC</p>
        <dl>{submissionFields(lead.data).map(([field, value]) => <div key={field} className="py-1">
          <dt className="break-words text-xs font-medium">{field}</dt><dd className="whitespace-pre-wrap break-words text-sm">{typeof value === "string" ? value : JSON.stringify(value)}</dd>
        </div>)}</dl>
      </li>
      {thread.data.length === 100 ? <li className="text-xs text-[var(--platform-muted)]">Showing the latest 100 emails.</li> : null}
      {[...thread.data].reverse().map((message) => <li className="platform-panel space-y-2 p-3" key={message.id}>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--platform-muted)]">
          <span>{message.direction === "in" ? "From lead" : "To lead"} · {labels[message.delivery_state]}</span><span>{date(message.created_at)} UTC</span>
        </div>
        {message.auto_reply ? <details><summary className="cursor-pointer text-sm">Automatic reply: {message.subject || "(no subject)"}</summary>{renderBody(message)}</details>
          : <><p className="break-words text-sm font-semibold">{message.subject || "(no subject)"}</p>{renderBody(message)}</>}
        {message.lead_reply_forwards.some(({ state }) => state === "failed" || state === "retrying") ? <p role="status" className="text-xs text-[var(--platform-error)]">
          This reply was saved, but {message.lead_reply_forwards.some(({ state }) => state === "retrying") ? "not all copies forwarded yet; retry scheduled." : "one or more email copies could not be forwarded."}
        </p> : null}
        {message.direction === "out" ? <LeadReplyActions
          leadId={lead.id}
          messageId={message.id}
          stalePending={message.delivery_state === "sending"}
          failed={message.delivery_state === "failed"}
        /> : null}
      </li>)}
    </ol>
    {route.data?.mode === "direct" ? <p className="text-xs text-[var(--platform-muted)]">New replies go directly to the notification mailbox and do not appear in this conversation.</p> : null}
    {route.data?.bounced || route.data?.undeliverable ? <p role="status" className="text-sm text-[var(--platform-error)]">
      {route.data?.undeliverable_type === "spam_complaint"
        ? "This address reported email as spam. Replies are disabled."
        : "This address bounced or is undeliverable. Replies are disabled."}
      {route.data?.undeliverable_reason ? <span className="block text-xs">{route.data.undeliverable_reason}</span> : null}
    </p>
      : lead.archived ? <p className="text-sm">Restore this lead before replying.</p>
      : email.success ? <LeadReplyComposer leadId={lead.id} siteId={lead.site_id} to={email.data} business={name}
        firstName={contact.name?.trim().split(/\s+/)[0] ?? ""} siteUrl={siteUrl} canCopy={Boolean(route.data?.owner_copy)}
        signature={[name, business.phone, business.address, siteUrl].filter(Boolean).join("\n")}
        templates={templates.data} pages={pages.data.map((page) => ({ ...page, sections: [] }))} />
      : <p className="text-sm">No valid email address was submitted for this lead.</p>}
  </section>;
}
