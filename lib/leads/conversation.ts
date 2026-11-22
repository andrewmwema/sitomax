import "server-only";

import { z } from "zod";
import type { requireUser } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { businessSchema, emptyBusiness } from "@/lib/business";
import { submissionContact, type Lead } from "@/lib/forms/submissions";
import { getSiteUrl } from "@/lib/site-url";
import {
  cleanLeadEmailHtml, leadReplyParts, leadReplySubject, leadSubjectKey, leadThreadQuote, replyTextHtml,
  resolveLeadSignature, stripQuotedReply, type LeadReplyQuote,
} from "./reply-content";
import { leadReplyPreview } from "./reply-mail";

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];
type MessageRow = {
  id: string; direction: "in" | "out"; subject: string; body_html: string; body_text: string; forward_text: string | null;
  actor_id: string | null; delivery_state: string; delivery_status: "delivered" | "bounced" | null; delivery_status_at: string | null;
  auto_reply: boolean; has_attachments: boolean; created_at: string; lead_reply_forwards: { state: string }[];
};
const messageColumns = "id, direction, subject, body_html, body_text, forward_text, actor_id, delivery_state, delivery_status, delivery_status_at, auto_reply, has_attachments, created_at, lead_reply_forwards(state)";
const deliveryLabels: Record<string, string> = { sending: "Sending", sent: "Sent", failed: "Not sent", received: "Received" };
const HEX = /^#[0-9a-f]{6}$/i;

export type LeadReplyTemplate = { id: string; name: string; body_text: string };
export type LeadThreadMessage = {
  id: string; direction: "in" | "out"; sender: string; subject: string; showSubject: boolean;
  /** Sanitized HTML. */
  html: string;
  /** Sanitized HTML of the quoted history of one of our emails. */
  quoteHtml: string;
  /** The full received email, when it is longer than the reply shown. */
  quoteText: string;
  delivery: { label: string; tone: "ok" | "pending" | "error"; at: string | null } | null;
  forwardIssue: string | null; autoReply: boolean; hasAttachments: boolean; createdAt: string;
};
export type LeadComposerConfig = {
  leadId: string; siteId: string; userId: string; admin: boolean;
  to: { name: string; email: string }; firstName: string; business: string; siteUrl: string;
  subject: string; signature: string; quote: LeadReplyQuote | null;
  bcc: { email: string; mine: boolean } | null;
  /** Never carries the tracked reply address. */
  details: { from: string | null; replyTo: string; note: string; problem: string | null };
  templates: LeadReplyTemplate[];
  pages: { id: string; title: string; slug: string; sections: never[] }[];
  palette: string[];
};
export type LeadConversation = {
  messages: LeadThreadMessage[]; via: string; truncated: boolean;
  selectedId: string | null; selectedMissing: boolean;
  notice: string | null;
  blocked: { message: string; detail?: string } | null;
  composer: LeadComposerConfig | null;
};

export async function loadLeadConversation(
  supabase: Client, lead: Lead, userId: string, selectedMessage?: string,
): Promise<LeadConversation | null> {
  const [route, thread, selected, templates, site, pages, senders, agency, profile, signature] = await Promise.all([
    supabase.rpc("get_lead_reply_route", { p_lead: lead.id }),
    supabase.from("lead_messages").select(messageColumns)
      .eq("lead_id", lead.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100).returns<MessageRow[]>(),
    selectedMessage ? supabase.from("lead_messages").select(messageColumns).eq("lead_id", lead.id).eq("id", selectedMessage).maybeSingle<MessageRow>() : null,
    supabase.from("lead_reply_templates").select("id, name, body_text").eq("site_id", lead.site_id).order("name").limit(100).returns<LeadReplyTemplate[]>(),
    supabase.from("sites").select("name, subdomain, business, theme, custom_domain, domain_verified").eq("id", lead.site_id).maybeSingle(),
    supabase.from("pages").select("id, title, slug").eq("site_id", lead.site_id).not("published_at", "is", null).order("title"),
    supabase.rpc("lead_reply_senders", { p_lead: lead.id }),
    supabase.from("agency_settings").select("name").eq("id", 1).maybeSingle(),
    supabase.from("profiles").select("full_name, email, is_super_admin").eq("id", userId).maybeSingle(),
    supabase.from("profiles").select("email_signature").eq("id", userId).maybeSingle(),
  ]);
  const failed = route.error ?? thread.error ?? selected?.error ?? templates.error ?? site.error ?? pages.error ?? senders.error ?? agency.error ?? profile.error;
  if (failed || !site.data || !thread.data || !templates.data || !pages.data) {
    console.error("Could not load a lead conversation", { leadId: lead.id, code: failed?.code });
    return null;
  }
  // The signature column arrives with migration 0044; until then the default signature is used.
  if (signature.error) console.error("Could not load the saved email signature", { code: signature.error.code });

  const business = businessSchema.parse({ ...emptyBusiness, ...site.data.business });
  const name = business.businessName || site.data.name || site.data.subdomain;
  const siteUrl = getSiteUrl(site.data);
  const contact = submissionContact(lead.data);
  const leadName = contact.name?.trim() || contact.email?.trim() || "Lead";
  const email = z.email().safeParse(route.data?.email);
  const replyRoute = z.object({ mode: z.enum(["direct", "tracked"]), direct_to: z.string().nullable() }).safeParse(route.data);
  const addresses = replyRoute.success ? leadReplyPreview(name, lead.id, replyRoute.data) : null;
  const senderNames = z.array(z.object({ actor_id: z.uuid(), name: z.string() })).parse(senders.data);
  const agencyName = agency.data?.name?.trim();
  const rows = [...thread.data];
  if (selected?.data && !rows.some((message) => message.id === selected.data?.id)) rows.push(selected.data);
  rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

  let previousSubject: string | null = null;
  const messages = rows.map((message): LeadThreadMessage => {
    const inbound = message.direction === "in";
    const unquoted = inbound ? stripQuotedReply(message.body_text) : "";
    const quoteInBody = inbound && unquoted !== message.body_text.trim();
    const full = message.forward_text || message.body_text;
    const parts = inbound ? null : leadReplyParts(message.body_html);
    const subjectKey = leadSubjectKey(message.subject);
    const showSubject = previousSubject === null || subjectKey !== previousSubject;
    previousSubject = subjectKey;
    const forwards = message.lead_reply_forwards.map(({ state }) => state);
    return {
      id: message.id, direction: message.direction, subject: message.subject || "(no subject)", showSubject,
      sender: inbound ? leadName : senderNames.find((person) => person.actor_id === message.actor_id)?.name || "Team member",
      html: parts ? parts.body : quoteInBody ? replyTextHtml(unquoted || "No unquoted reply text.") : cleanLeadEmailHtml(message.body_html),
      quoteHtml: parts?.quote ?? "",
      quoteText: inbound && (quoteInBody || (message.forward_text && message.forward_text.trim() !== message.body_text.trim())) ? full : "",
      delivery: inbound ? null : message.delivery_status
        ? { label: message.delivery_status === "delivered" ? "Delivered" : "Bounced", tone: message.delivery_status === "delivered" ? "ok" : "error", at: message.delivery_status_at }
        : { label: deliveryLabels[message.delivery_state] ?? "Status unavailable", tone: message.delivery_state === "sent" ? "ok" : message.delivery_state === "failed" ? "error" : "pending", at: null },
      forwardIssue: forwards.includes("retrying") ? "This reply was saved, but not all copies forwarded yet; retry scheduled."
        : forwards.includes("failed") ? "This reply was saved, but one or more email copies could not be forwarded." : null,
      autoReply: message.auto_reply, hasAttachments: message.has_attachments, createdAt: message.created_at,
    };
  });

  const latest = [...rows].reverse().find((message) => !message.auto_reply && message.delivery_state !== "failed") ?? null;
  const theme = z.object({ colors: z.record(z.string(), z.unknown()).optional() }).safeParse(site.data.theme);
  const themeColors = theme.success ? ["primary", "secondary", "accent", "text"].map((key) => theme.data.colors?.[key]) : [];
  const palette = [...new Set(["#151829", "#3A3F55", "#6B7085", ...themeColors, "#1E51F7", "#0F7246", "#B42318"]
    .flatMap((color) => typeof color === "string" && HEX.test(color) ? [color.toLowerCase()] : []))];
  const ownerCopy = z.email().safeParse(route.data?.owner_copy);
  const mode = replyRoute.success ? replyRoute.data.mode : null;

  const blocked: LeadConversation["blocked"] = route.data?.bounced || route.data?.undeliverable
    ? {
      message: route.data?.undeliverable_type === "spam_complaint"
        ? "This address reported email as spam. Replies are disabled."
        : "This address bounced or is undeliverable. Replies are disabled.",
      detail: typeof route.data?.undeliverable_reason === "string" ? route.data.undeliverable_reason : undefined,
    }
    : lead.deleted_at ? { message: "Restore this lead from Trash before replying." }
    : lead.archived ? { message: "Unarchive this lead before replying." }
    : !email.success ? { message: "No valid email address was submitted for this lead." }
    : !addresses || !mode ? { message: "The reply settings are unavailable." }
    : null;

  return {
    messages, via: agencyName && agencyName !== "My Agency" ? agencyName : brand.name,
    truncated: thread.data.length === 100,
    selectedId: selected?.data?.id ?? null, selectedMissing: Boolean(selectedMessage && !selected?.data),
    notice: mode === "direct" ? "New replies go directly to the notification mailbox and do not appear in this conversation." : null,
    blocked,
    composer: blocked || !email.success || !addresses || !mode ? null : {
      leadId: lead.id, siteId: lead.site_id, userId, admin: profile.data?.is_super_admin === true,
      to: { name: contact.name?.trim() ?? "", email: email.data },
      firstName: contact.name?.trim().split(/\s+/)[0] ?? "", business: name, siteUrl,
      subject: leadReplySubject(latest?.subject, name),
      signature: resolveLeadSignature(signature.data?.email_signature, {
        name: profile.data?.full_name?.trim() ?? "", business_name: name, phone: business.phone, website: siteUrl,
      }),
      quote: leadThreadQuote(latest, lead, name),
      bcc: ownerCopy.success ? { email: ownerCopy.data, mine: ownerCopy.data.toLowerCase() === profile.data?.email?.toLowerCase() } : null,
      details: {
        from: addresses.from,
        replyTo: mode === "tracked" ? addresses.replyTo ? "Tracked in this conversation" : "" : addresses.replyTo ?? "",
        note: mode === "tracked"
          ? "Replies from the lead's email address are tracked here when inbound email is configured, and may also be forwarded to notification recipients."
          : "Replies go directly to this mailbox and do not appear in this conversation.",
        problem: !addresses.from ? "Lead email is not configured. Contact your agency." : addresses.replyToError,
      },
      templates: templates.data, pages: pages.data.map((page) => ({ ...page, sections: [] })), palette,
    },
  };
}
