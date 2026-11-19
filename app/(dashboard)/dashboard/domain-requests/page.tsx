import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { domainRequestSchema } from "@/lib/domains/requests";
import { DomainRequestsWorkspace } from "@/components/dashboard/domain-requests-workspace";

type RequestPageParams = { searchParams: Promise<{ page?: string | string[] }> };

export default function DomainRequestsPage({ searchParams }: RequestPageParams) {
  return <section className="flex flex-col gap-6">
    <header><p className="platform-eyebrow mb-1">Operations</p><h1 className="text-2xl font-semibold tracking-tight">Domain Requests</h1>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">Track domain connections, DNS setup, and verification.</p></header>
    <Suspense fallback={<div role="status" aria-label="Loading domain requests" className="h-64 animate-pulse rounded-2xl bg-[var(--platform-subtle)]" />}><Requests searchParams={searchParams} /></Suspense>
  </section>;
}

async function Requests({ searchParams }: RequestPageParams) {
  const { supabase } = await requireSuperAdmin();
  const page = z.coerce.number().int().min(1).max(10_000).safeParse((await searchParams).page ?? 1);
  if (!page.success) notFound();
  const schema = z.array(domainRequestSchema.extend({
    done_at: z.string().nullable(), notification_sent_at: z.string().nullable(),
    site: z.object({
      name: z.string().nullable(), subdomain: z.string(), custom_domain: z.string().nullable(), domain_verified: z.boolean(),
      account: z.object({ name: z.string() }),
    }),
  }));
  const requests: z.infer<typeof schema> = [];
  for (let from = 0; ; from += 500) {
    const result = await supabase.from("domain_requests").select(
      "id, site_id, domain, provider, status, notes, created_at, done_at, notification_sent_at, site:sites(name, subdomain, custom_domain, domain_verified, account:accounts(name))",
    ).order("created_at", { ascending: false }).order("id").range(from, from + 499);
    if (result.error) throw new Error("Could not load domain requests. Apply the domain requests migration.", { cause: result.error });
    const batch = schema.parse(result.data ?? []);
    requests.push(...batch);
    if (batch.length < 500) break;
  }
  return <DomainRequestsWorkspace key={page.data} requests={requests} initialPage={page.data} />;
}
