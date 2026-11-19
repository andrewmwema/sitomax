import "server-only";

import { findUnreplacedPlaceholders } from "@/lib/sections/placeholders";
import { requireUser } from "@/lib/auth";
import type { SiteCardSite } from "@/components/dashboard/site-card";

type SiteRow = Omit<SiteCardSite, "accountName" | "canManageDomains" | "placeholderCount" | "pages" | "createdAt"> & {
  account_id: string;
  created_at: string;
  account: { name: string | null } | null;
  pages: { id: string; slug: string; published_at: string | null; draft_data: unknown }[];
};

export async function getDashboardSites() {
  const { supabase, user } = await requireUser();
  const [{ data: profile, error: profileError }, { data, error: sitesError }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.from("profiles").select("full_name, is_super_admin").eq("id", user.id).maybeSingle(),
    supabase.from("sites")
      .select("id, account_id, name, subdomain, custom_domain, domain_verified, created_at, account:accounts(name), pages(id, slug, published_at, draft_data)")
      .order("created_at", { ascending: false }),
    supabase.from("account_members").select("account_id").eq("user_id", user.id).eq("role", "owner"),
  ]);
  if (profileError || sitesError || membershipError) throw new Error("Could not load your workspace sites.");
  const isAdmin = Boolean(profile?.is_super_admin);
  const sites = (data ?? []) as unknown as SiteRow[];
  const ownerAccounts = new Set((memberships ?? []).map(({ account_id }) => account_id));
  const visibleSites: SiteCardSite[] = sites.map((site) => ({
    id: site.id, name: site.name, subdomain: site.subdomain, custom_domain: site.custom_domain,
    domain_verified: site.domain_verified, accountId: site.account_id, accountName: site.account?.name ?? null,
    canManageDomains: isAdmin || ownerAccounts.has(site.account_id),
    createdAt: site.created_at,
    pages: site.pages.map(({ id, slug, published_at }) => ({ id, slug, published_at })),
    placeholderCount: site.pages.reduce((total, page) => {
      if (!page.draft_data || typeof page.draft_data !== "object") return total;
      const content = (page.draft_data as { content?: unknown }).content;
      return total + (Array.isArray(content) ? findUnreplacedPlaceholders({ content }).length : 0);
    }, 0),
  }));
  const firstOwnedSite = sites.find((site) => isAdmin || ownerAccounts.has(site.account_id));
  return {
    supabase,
    profile,
    sites: visibleSites,
    isAdmin,
    canSeeReporting: isAdmin || ownerAccounts.size > 0,
    ownerSite: visibleSites.find((site) => site.id === firstOwnedSite?.id),
  };
}
