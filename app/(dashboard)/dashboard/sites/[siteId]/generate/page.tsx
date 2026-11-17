import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AiSiteWizard } from "@/components/dashboard/ai-site-wizard";

export const maxDuration = 300;

export default async function RegenerateSitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { supabase } = await requireUser();
  const { data: site, error } = await supabase.from("sites").select("id, account_id, name").eq("id", siteId).maybeSingle();
  if (error) throw new Error("Could not load the site.", { cause: error });
  if (!site) notFound();
  const [{ data: admin, error: adminError }, { data: owner, error: ownerError }] = await Promise.all([
    supabase.rpc("is_super_admin"), supabase.rpc("is_account_owner", { acc: site.account_id }),
  ]);
  if (adminError || ownerError) throw new Error("Could not verify generation access.");
  if (!admin && !owner) notFound();
  return <section className="mx-auto flex max-w-3xl flex-col gap-6">
    <header><Link className="text-sm text-zinc-500 hover:underline" href={`/dashboard/sites/${siteId}`}>{site.name || "Your site"}</Link>
      <h1 className="mt-2 text-2xl font-semibold">Build with AI</h1>
      <p className="mt-2 text-sm text-zinc-600">Create a new draft direction without changing your published pages.</p></header>
    <AiSiteWizard accounts={[]} existingSite={{ id: site.id, accountId: site.account_id, name: site.name ?? "" }}
      rootDomain={process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000"} />
  </section>;
}
