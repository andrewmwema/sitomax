import { Suspense } from "react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { LEAD_COLUMNS } from "@/lib/forms/queries";
import type { Lead, LeadEvent, LeadNote } from "@/lib/forms/submissions";
import { loadLeadConversation } from "@/lib/leads/conversation";
import { ConversationSkeleton, LeadConversationView } from "@/components/dashboard/leads/conversation";

export default function LeadConversationPage({ params }: { params: Promise<{ leadId: string }> }) {
  return <Suspense fallback={<ConversationSkeleton />}><Conversation params={params} /></Suspense>;
}

function Unavailable() {
  return <div className="flex flex-1 items-center justify-center p-8">
    <p role="alert" className="text-sm text-[var(--lead-muted)]">That lead is unavailable or you do not have permission to view it.</p>
  </div>;
}

async function Conversation({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const id = z.uuid().safeParse(leadId);
  if (!id.success) return <Unavailable />;
  const { supabase, user } = await requireUser();
  const detail = await supabase.from("form_submissions").select(LEAD_COLUMNS).eq("id", id.data).maybeSingle<Lead>();
  if (detail.error) throw new Error("Could not load this lead.");
  if (!detail.data) return <Unavailable />;
  const lead = detail.data;

  const [conversation, notes, events, site, manage] = await Promise.all([
    loadLeadConversation(supabase, lead, user.id),
    supabase.from("lead_notes").select("id, author_id, body, created_at").eq("lead_id", lead.id)
      .order("created_at", { ascending: false }).order("id").returns<LeadNote[]>(),
    supabase.from("lead_events").select("id, type, data, created_at").eq("lead_id", lead.id)
      .order("created_at", { ascending: false }).order("id").returns<LeadEvent[]>(),
    supabase.from("sites").select("name, subdomain").eq("id", lead.site_id).maybeSingle(),
    // Trash and export are limited to account owners and the agency.
    supabase.rpc("can_manage_site_leads", { p_site: lead.site_id }),
  ]);
  return <LeadConversationView key={lead.id} lead={lead} userId={user.id} conversation={conversation}
    siteName={site.data?.name || site.data?.subdomain || "Website"} canTrash={manage.data === true}
    notes={notes.error ? null : notes.data.map((note) => ({ id: note.id, body: note.body, created_at: note.created_at, mine: note.author_id === user.id }))}
    events={events.error ? null : events.data} />;
}
