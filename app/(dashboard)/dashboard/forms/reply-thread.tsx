import type { requireUser } from "@/lib/auth";
import type { Lead } from "@/lib/forms/submissions";
import { loadLeadConversation } from "@/lib/leads/conversation";
import { LeadComposer } from "@/components/dashboard/leads/composer";
import { ReplyBlocked } from "@/components/dashboard/leads/conversation";
import { LeadThread } from "@/components/dashboard/leads/thread";
import { LeadToaster } from "@/components/dashboard/leads/ui";

/** The conversation and reply composer shared with the Leads inbox. */
export async function LeadReplyThread({ lead, supabase, userId, siteName, selectedMessage }: {
  lead: Lead; supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]; userId: string; siteName: string; selectedMessage?: string;
}) {
  const conversation = await loadLeadConversation(supabase, lead, userId, selectedMessage);
  if (!conversation) return <p role="alert" className="text-sm">The reply conversation is unavailable.</p>;
  return <section className="leads-ui space-y-4">
    <h3 className="text-sm font-semibold">Conversation</h3>
    <LeadThread lead={lead} siteName={siteName} conversation={conversation} />
    {conversation.composer ? <LeadComposer config={conversation.composer} /> : <ReplyBlocked blocked={conversation.blocked} />}
    <LeadToaster />
  </section>;
}
