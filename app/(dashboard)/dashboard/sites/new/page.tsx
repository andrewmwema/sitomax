import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { instantiateTemplate } from "@/templates/instantiate";
import { templates } from "@/templates";
import { NewSiteWizard } from "@/components/dashboard/new-site-wizard";
import type { SectionDesign } from "@/lib/sections/catalog";

export default async function NewSitePage() {
  const { supabase } = await requireSuperAdmin();
  const { data: accounts, error } = await supabase.from("accounts").select("id, name").order("name");
  if (error) throw new Error("Could not load client accounts.", { cause: error });
  const sample = { businessName: "Your business", city: "Your city", phone: "0123 456 789", email: "hello@example.com", address: "Your address", services: "your services" };
  const choices = Object.values(templates).map((template) => {
    const hero = instantiateTemplate(template, sample)[0].data.content.find((item) => item.type === "Hero");
    if (!hero) throw new Error(`Missing preview for ${template.key}`);
    return {
      key: template.key, name: template.name, theme: template.theme,
      design: { id: `preview-${template.key}`, name: template.name, blockType: hero.type, category: "Hero",
        props: hero.props, thumbnail: null, styles: ["classic", "modern"] } satisfies SectionDesign,
    };
  });
  return <section className="mx-auto flex max-w-5xl flex-col gap-6">
    <header>
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">Sites</Link>
      <h1 className="mt-2 text-2xl font-semibold">Create a site</h1>
      <p className="mt-1 text-sm text-zinc-600">Choose a client and a starting design, then add their business details.</p>
    </header>
    {accounts?.length ? <NewSiteWizard accounts={accounts} choices={choices} rootDomain={process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000"} /> :
      <p className="rounded-xl border bg-white p-6 text-sm">Create a <Link className="underline" href="/dashboard/clients">client account</Link> first.</p>}
  </section>;
}
