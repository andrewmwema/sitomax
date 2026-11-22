import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { allowedLeadSites } from "@/lib/forms/queries";
import { LeadsInbox, LeadsInboxSkeleton } from "@/components/dashboard/leads/inbox";

/**
 * The lead list lives in this layout so it stays mounted (scroll position,
 * loaded pages, selection) while conversations open beside it.
 */
export default function LeadsLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LeadsInboxSkeleton />}><LeadsShell>{children}</LeadsShell></Suspense>;
}

// A new value on every server render: lead actions revalidate this layout, which reloads the list.
const renderStamp = () => Date.now().toString(36);

async function LeadsShell({ children }: { children: ReactNode }) {
  const { supabase, user } = await requireUser();
  const [sites, admin] = await Promise.all([allowedLeadSites(supabase, user.id), supabase.rpc("is_super_admin")]);
  return <LeadsInbox userId={user.id} agency={admin.data === true} refreshKey={renderStamp()}
    sites={sites.map(({ id, name, subdomain }) => ({ id, name, subdomain }))}>{children}</LeadsInbox>;
}
