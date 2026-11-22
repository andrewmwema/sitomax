import { z } from "zod";
import type { requireUser } from "@/lib/auth";
import { businessSchema, emptyBusiness } from "@/lib/business";
import { submissionContact, submissionFields, type Lead } from "@/lib/forms/submissions";
import { getSiteUrl } from "@/lib/site-url";
import { cleanLeadEmailHtml, replyTextHtml, stripQuotedReply } from "@/lib/leads/reply-content";
import { leadReplyPreview } from "@/lib/leads/reply-mail";
import { LeadReplyComposer, type LeadReplyTemplate } from "@/components/dashboard/lead-reply-composer";
import { LocalTime } from "@/components/dashboard/local-time";
import { ScrollToMessage } from "@/components/dashboard/scroll-to-message";
import { MarkLeadViewed } from "@/components/dashboard/mark-lead-viewed";
import { brand } from "@/lib/brand";

type Message = {
  id: string; direction: "in" | "out"; subject: string; body_html: string; delivery_state: string;
  delivery_status: "delivered" | "bounced" | null; delivery_status_at: string | null;
  actor_id: string | null; forward_text: string | null; body_text: string;
  auto_reply: boolean; has_attachments: boolean; created_at: string; lead_reply_forwards: { state: string }[];
};
const labels: Record<string, string> = { sending: "Sending / not confirmed", sent: "Sent", failed: "Sending failed", received: "Received" };
const messageColumns = "id, direction, subject, body_html, body_text, forward_text, actor_id, delivery_state, delivery_status, delivery_status_at, auto_reply, has_attachments, created_at, lead_reply_forwards(state)";

export async function LeadReplyThread({ lead, supabase, selectedMessage }: {
  lead: Lead; supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]; selectedMessage?: string;
}) {
  const [route, thread, selected, templates, site, pages, senders, agency] = await Promise.all([
    supabase.rpc("get_lead_reply_route", { p_lead: lead.id }),
    supabase.from("lead_messages").select(messageColumns)
      .eq("lead_id", lead.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100).returns<Message[]>(),
    selectedMessage ? supabase.from("lead_messages").select(messageColumns).eq("lead_id", lead.id).eq("id", selectedMessage).maybeSingle<Message>() : null,
    supabase.from("lead_reply_templates").select("id, name, body_text").eq("site_id", lead.site_id).order("name").limit(100).returns<LeadReplyTemplate[]>(),
    supabase.from("sites").select("name, subdomain, business, custom_domain, domain_verified").eq("id", lead.site_id).maybeSingle(),
    supabase.from("pages").select("id, title, slug").eq("site_id", lead.site_id).not("published_at", "is", null).order("title"),
    supabase.rpc("lead_reply_senders", { p_lead: lead.id }),
    supabase.from("agency_settings").select("name").eq("id", 1).maybeSingle(),
  ]);
  if (route.error || thread.error || selected?.error || templates.error || site.error || pages.error || senders.error || agency.error || !site.data) {
    console.error("Could not load a lead conversation", { leadId: lead.id, code: route.error?.code ?? thread.error?.code ?? selected?.error?.code ?? templates.error?.code ?? site.error?.code ?? pages.error?.code ?? senders.error?.code ?? agency.error?.code });
    return <p role="alert" className="text-sm">The reply conversation is unavailable.</p>;
  }
  const business = businessSchema.parse({ ...emptyBusiness, ...site.data.business });
  const name = business.businessName || site.data.name || site.data.subdomain;
  const siteUrl = getSiteUrl(site.data);
  const contact = submissionContact(lead.data);
  const email = z.email().safeParse(route.data?.email);
  const replyRoute = z.object({ mode: z.enum(["direct", "tracked"]), direct_to: z.string().nullable() }).safeParse(route.data);
  const addresses = replyRoute.success ? leadReplyPreview(name, lead.id, replyRoute.data) : null;
  const senderNames = z.array(z.object({ actor_id: z.uuid(), name: z.string() })).parse(senders.data);
  const agencyName = agency.data?.name?.trim();
  const via = agencyName && agencyName !== "My Agency" ? agencyName : brand.name;
  const messages = [...thread.data];
  if (selected?.data && !messages.some((message) => message.id === selected.data?.id)) messages.push(selected.data);
  messages.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const renderBody = (message: Message) => {
    const unquoted = message.direction === "in" ? stripQuotedReply(message.body_text) : message.body_text;
    const quoteInBody = message.direction === "in" && unquoted !== message.body_text.trim();
    return <>
    <div className="rich-text break-words text-sm" dangerouslySetInnerHTML={{
      __html: quoteInBody ? replyTextHtml(unquoted || "No unquoted reply text.") : cleanLeadEmailHtml(message.body_html),
    }} />
    {message.direction === "in" && (quoteInBody || (message.forward_text && message.forward_text.trim() !== message.body_text.trim()))
      ? <details className="mt-2 text-xs"><summary className="cursor-pointer">Show full email and quoted text</summary>
        <p className="mt-2 whitespace-pre-wrap break-words">{message.forward_text || message.body_text}</p></details> : null}
    {message.has_attachments ? <p className="text-xs">Attachments not shown.</p> : null}
  </>;
  };
  return <section className="space-y-4">
    <h3 className="text-sm font-semibold">Conversation</h3>
    {!lead.is_read || lead.has_unread_reply ? <MarkLeadViewed id={lead.id} lastActivity={lead.last_activity_at} /> : null}
    {selectedMessage && !selected?.data ? <p role="alert" className="text-sm">That message is unavailable.</p> : null}
    {selected?.data ? <ScrollToMessage id={selected.data.id} /> : null}
    <ol className="space-y-2">
      <li className="flex gap-2"><span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--platform-subtle)] text-xs font-semibold">{(contact.name || "Lead").charAt(0).toUpperCase()}</span>
        <div className="min-w-0 max-w-[90%] rounded-xl border border-[var(--platform-line)] bg-[var(--platform-ground)] p-4"><p className="text-sm font-semibold">{contact.name || "Lead"} · Original form submission</p>
        <p className="mt-1 text-xs text-[var(--platform-muted)]"><LocalTime value={lead.created_at} /></p>
        <dl>{submissionFields(lead.data).map(([field, value]) => <div key={field} className="py-1">
          <dt className="break-words text-xs font-medium">{field}</dt><dd className="whitespace-pre-wrap break-words text-sm">{typeof value === "string" ? value : JSON.stringify(value)}</dd>
        </div>)}</dl>
      </div></li>
      {thread.data.length === 100 ? <li className="text-xs text-[var(--platform-muted)]">Showing the latest 100 emails{messages.length > 100 ? " and the selected message" : ""}.</li> : null}
      {messages.map((message) => {
        const sender = message.direction === "in" ? contact.name || "Lead" : senderNames.find((person) => person.actor_id === message.actor_id)?.name || "Team member";
        const status = message.direction === "out" && message.delivery_status ? message.delivery_status === "delivered" ? "Delivered" : "Bounced" : labels[message.delivery_state] ?? "Status unavailable";
        return <li id={`message-${message.id}`} className={`flex scroll-mt-6 gap-2 ${message.direction === "out" ? "flex-row-reverse" : ""}`} key={message.id}>
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--platform-subtle)] text-xs font-semibold">{sender.charAt(0).toUpperCase()}</span>
        <div className={`min-w-0 max-w-[90%] space-y-2 rounded-xl border border-[var(--platform-line)] p-4 ${message.direction === "out" ? "bg-[var(--platform-subtle)]" : "bg-[var(--platform-ground)]"}`}>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--platform-muted)]">
          <span className="font-semibold">{sender}{message.direction === "out" ? ` · via ${via}` : ""}</span><LocalTime value={message.created_at} />
        </div>
        {message.auto_reply ? <details><summary className="cursor-pointer text-sm">Automatic reply: {message.subject || "(no subject)"}</summary>{renderBody(message)}</details>
          : <><p className="break-words text-sm font-semibold">{message.subject || "(no subject)"}</p>{renderBody(message)}</>}
        {message.lead_reply_forwards.some(({ state }) => state === "failed" || state === "retrying") ? <p role="status" className="text-xs text-[var(--platform-error)]">
          This reply was saved, but {message.lead_reply_forwards.some(({ state }) => state === "retrying") ? "not all copies forwarded yet; retry scheduled." : "one or more email copies could not be forwarded."}
        </p> : null}
        <p className="text-xs text-[var(--platform-muted)]">{status}{message.direction === "out" && message.delivery_status_at ? <> · <LocalTime value={message.delivery_status_at} /></> : null}</p>
        </div>
      </li>})}
    </ol>
    {route.data?.mode === "direct" ? <p className="text-xs text-[var(--platform-muted)]">New replies go directly to the notification mailbox and do not appear in this conversation.</p> : null}
    {route.data?.bounced || route.data?.undeliverable ? <p role="status" className="text-sm text-[var(--platform-error)]">
      {route.data?.undeliverable_type === "spam_complaint"
        ? "This address reported email as spam. Replies are disabled."
        : "This address bounced or is undeliverable. Replies are disabled."}
      {route.data?.undeliverable_reason ? <span className="block text-xs">{route.data.undeliverable_reason}</span> : null}
    </p>
      : lead.archived ? <p className="text-sm">Restore this lead before replying.</p>
      : !email.success ? <p className="text-sm">No valid email address was submitted for this lead.</p>
      : !addresses || !replyRoute.success ? <p role="alert" className="text-sm">The reply settings are unavailable.</p>
      : <LeadReplyComposer leadId={lead.id} siteId={lead.site_id} to={email.data} business={name}
        from={addresses.from} replyTo={addresses.replyTo} replyToError={addresses.replyToError} replyMode={replyRoute.data.mode}
        firstName={contact.name?.trim().split(/\s+/)[0] ?? ""} siteUrl={siteUrl} canCopy={Boolean(route.data?.owner_copy)}
        signature={[name, business.phone, business.address, siteUrl].filter(Boolean).join("\n")}
        templates={templates.data} pages={pages.data.map((page) => ({ ...page, sections: [] }))} />}
  </section>;
}
