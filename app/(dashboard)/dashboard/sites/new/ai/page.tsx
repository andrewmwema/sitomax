import Link from "next/link";
import { getSiteAccountOptions } from "@/lib/accounts";
import { AiSiteWizard } from "@/components/dashboard/ai-site-wizard";
import { brand } from "@/lib/brand";

export const maxDuration = 300;

export default async function AiNewSitePage() {
  const accounts = await getSiteAccountOptions();
  return <section className="mx-auto flex max-w-3xl flex-col gap-6">
    <header><Link className="text-sm text-zinc-500 hover:underline" href="/dashboard/sites/new">New site</Link>
      <h1 className="mt-2 text-2xl font-semibold">Build with AI</h1>
      <p className="mt-2 text-sm text-zinc-600">A considered starting point, built from our section designs and your business details.</p></header>
    {accounts?.length ? <AiSiteWizard accounts={accounts} rootDomain={brand.rootDomain}
      marketingSubdomain={brand.marketingSiteSubdomain} />
      : <p>Create a <Link className="underline" href="/dashboard/clients">client account</Link> first.</p>}
  </section>;
}
