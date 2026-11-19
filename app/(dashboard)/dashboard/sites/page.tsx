import { getDashboardSites } from "@/lib/dashboard/sites";
import { brand } from "@/lib/brand";
import { SiteGrid } from "@/components/dashboard/site-grid";

export default async function SitesPage({ searchParams }: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const [{ sites }, params] = await Promise.all([getDashboardSites(), searchParams]);
  const status = params.status === "live" || params.status === "draft" ? params.status : "all";
  return <SiteGrid sites={sites} marketingSubdomain={brand.marketingSiteSubdomain} initialFilter={status} />;
}
