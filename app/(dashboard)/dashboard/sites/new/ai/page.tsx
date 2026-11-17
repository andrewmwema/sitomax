import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { AiSiteWizard } from "@/components/dashboard/ai-site-wizard";
import { brand } from "@/lib/brand";

export const maxDuration = 300;

export default async function AiNewSitePage() {
  const { supabase } = await requireSuperAdmin();
  const { data: accounts, error } = await supabase.from("accounts").select("id, name").order("name");
  if (error) throw new Error("Could not load client accounts.", { cause: error });
  return <section className="mx-auto flex max-w-3xl flex-col gap-6">
    <header><Link className="text-sm text-zinc-500 hover:underline" href="/dashboard/sites/new">New site</Link>
      <h1 className="mt-2 text-2xl font-semibold">Build with AI</h1>
      <p className="mt-2 text-sm text-zinc-600">A considered starting point, built from our section designs and your business details.</p></header>
    {accounts?.length ? <AiSiteWizard accounts={accounts} rootDomain={brand.rootDomain} />
      : <p>Create a <Link className="underline" href="/dashboard/clients">client account</Link> first.</p>}
  </section>;
}
