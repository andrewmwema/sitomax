import Link from "next/link";
import { getSiteAccountOptions } from "@/lib/accounts";
import { AiSiteWizard } from "@/components/dashboard/ai-site-wizard";
import { brand } from "@/lib/brand";
import { ArrowLeft } from "lucide-react";

export const maxDuration = 300;

export default async function AiNewSitePage() {
  const accounts = await getSiteAccountOptions();
  return <section className="site-creation mx-auto flex w-full max-w-6xl flex-col gap-8">
    <header className="creation-page-header"><Link className="creation-back-link" href="/dashboard/sites/new"><ArrowLeft size={15} aria-hidden="true" />All creation options</Link>
      <p className="platform-eyebrow">AI site builder</p>
      <h1>From business idea to first draft</h1>
      <p>Bring the business details. Choose the pages and creative direction. Review your site before it goes live.</p></header>
    {accounts?.length ? <AiSiteWizard accounts={accounts} rootDomain={brand.rootDomain}
      marketingSubdomain={brand.marketingSiteSubdomain} />
      : <p>Create a <Link className="underline" href="/dashboard/clients">client account</Link> first.</p>}
  </section>;
}
